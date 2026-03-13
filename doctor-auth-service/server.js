const express = require('express');
const path = require('path');
const session = require('express-session');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const OHIF_TARGET = process.env.OHIF_TARGET || 'http://orthanc:8042/ohif';
const ORTHANC_TARGET = process.env.ORTHANC_TARGET || 'http://orthanc:8042';
const DOCTOR_USER = process.env.DOCTOR_USER || 'doctor';
const DOCTOR_PASS = process.env.DOCTOR_PASS || 'doctor123';
const CUSTOM_LOGO_URL = process.env.CUSTOM_LOGO_URL || '/branding/custom-logo.svg';

function injectViewerBranding(html) {
  const clientScript = `
<script>
(() => {
  const customLogoUrl = ${JSON.stringify(CUSTOM_LOGO_URL)};

  const forceSpanish = () => {
    try {
      localStorage.setItem('i18nextLng', 'es');
      document.documentElement.setAttribute('lang', 'es');
      sessionStorage.setItem('investigationalUseDialog', 'hidden');
      localStorage.setItem('investigationalUseDialog', JSON.stringify({ expiryDate: '2999-12-31T00:00:00.000Z' }));
    } catch (error) {
      console.warn('No fue posible forzar preferencias de idioma.', error);
    }
  };

  const removeInvestigationalDialog = () => {
    document.querySelectorAll('button').forEach(button => {
      const label = (button.textContent || '').trim().toLowerCase();
      if (!label.includes('confirm and hide')) {
        return;
      }

      const overlay = button.closest('.fixed.bottom-2') || button.closest('[role="dialog"]');
      if (overlay) {
        overlay.remove();
      }
    });
  };

  const removeLanguagePreference = () => {
    const languageLabels = ['language', 'idioma'];
    document.querySelectorAll('label, span, div').forEach(node => {
      const text = (node.textContent || '').trim().toLowerCase();
      if (!languageLabels.some(label => text === label || text.startsWith(label + ':'))) {
        return;
      }

      const block = node.closest('.flex, .grid, [role="group"], form > div');
      if (block) {
        block.remove();
      }
    });
  };

  const replaceLogos = () => {
    document.querySelectorAll('img[src*="ohif-logo"], img[alt*="OHIF" i]').forEach(logo => {
      logo.src = customLogoUrl;
      logo.alt = 'Logo personalizado';
      logo.style.objectFit = 'contain';
    });

    document.querySelectorAll('svg').forEach(svg => {
      const logoId = (svg.getAttribute('id') || '').toLowerCase();
      if (!logoId.includes('ohif')) {
        return;
      }

      const parent = svg.parentElement;
      if (!parent || parent.dataset.customLogoReplaced === 'true') {
        return;
      }

      const img = document.createElement('img');
      img.src = customLogoUrl;
      img.alt = 'Logo personalizado';
      img.style.height = '32px';
      img.style.width = 'auto';
      parent.dataset.customLogoReplaced = 'true';
      parent.replaceChild(img, svg);
    });
  };

  const applyCustomizations = () => {
    forceSpanish();
    removeInvestigationalDialog();
    removeLanguagePreference();
    replaceLogos();
  };

  applyCustomizations();
  new MutationObserver(applyCustomizations).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
</script>`;

  return html.includes('</body>')
    ? html.replace('</body>', `${clientScript}</body>`)
    : `${html}${clientScript}`;
}

const PATIENT_USERS = (() => {
  const raw = process.env.PATIENT_USERS_JSON;
  if (!raw) {
    return [
      {
        username: process.env.PATIENT_USER || 'patient',
        password: process.env.PATIENT_PASS || 'patient123',
        patientId: process.env.PATIENT_ID || 'PATIENT-001',
      },
    ];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn('PATIENT_USERS_JSON inválido. Se usará la configuración por defecto.');
    return [];
  }
})();

app.use(express.urlencoded({ extended: false }));
app.use('/branding', express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'cambia-esta-clave',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

const renderLogin = (message = '') => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Login de acceso</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f7fb; margin: 0; display: grid; place-items: center; min-height: 100vh; }
      .card { background: white; padding: 2rem; border-radius: 10px; width: 100%; max-width: 420px; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
      h1 { margin-top: 0; font-size: 1.4rem; }
      label { display: block; margin-bottom: .25rem; font-weight: 600; }
      input, select { width: 100%; padding: .6rem; margin-bottom: 1rem; border-radius: 8px; border: 1px solid #cfd6e4; }
      button { width: 100%; padding: .65rem; border: none; border-radius: 8px; background: #265dff; color: white; font-weight: 700; cursor: pointer; }
      .alert { margin-bottom: 1rem; color: #b42318; background: #fef3f2; border: 1px solid #fecdca; padding: .6rem; border-radius: 8px; }
      .hint { margin-top: 1rem; color: #344054; font-size: .85rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Panel de acceso para OHIF</h1>
      ${message ? `<div class="alert">${message}</div>` : ''}
      <form method="post" action="/login">
        <label for="username">Usuario</label>
        <input id="username" name="username" required />

        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" required />

        <button type="submit">Entrar a OHIF</button>
      </form>
      <p class="hint">Roles soportados: doctor (acceso total) y paciente (acceso solo a su PatientID).</p>
    </div>
  </body>
</html>`;


function renderViewerShell(user) {
  const roleLabel = user.role === 'doctor' ? 'Doctor' : `Paciente (${user.patientId})`;
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OHIF seguro</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0f172a; }
      .topbar { height: 50px; background: #111827; color: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; box-sizing: border-box; font-family: Arial, sans-serif; }
      .meta { font-size: 13px; opacity: 0.9; }
      .topbar button { border: none; border-radius: 999px; padding: 8px 12px; background: #ef4444; color: #fff; font-weight: 700; cursor: pointer; }
      .topbar button:hover { background: #dc2626; }
      iframe { border: 0; width: 100%; height: calc(100% - 50px); display: block; background: #000; }
    </style>
  </head>
  <body>
    <div class="topbar">
      <div class="meta">Usuario: ${user.username} · Rol: ${roleLabel}</div>
      <form method="post" action="/logout">
        <button type="submit">Cerrar sesión</button>
      </form>
    </div>
    <iframe src="/ohif/" title="OHIF Viewer"></iframe>
  </body>
</html>`;
}

function getSessionUser(req) {
  if (req.session?.authenticated && req.session?.role) {
    return {
      role: req.session.role,
      username: req.session.username,
      patientId: req.session.patientId,
    };
  }

  return null;
}

function requireAuth(req, res, next) {
  if (getSessionUser(req)) {
    return next();
  }

  return res.redirect('/login?message=Necesita%20autenticarse');
}

function getPatientIdFromStudyMetadata(metadata) {
  if (!Array.isArray(metadata) || metadata.length === 0) {
    return null;
  }

  const firstItem = metadata[0];
  const patientTag = firstItem?.['00100020']?.Value;
  return Array.isArray(patientTag) && patientTag.length > 0 ? String(patientTag[0]) : null;
}

function getPatientIdFromStudySummary(study) {
  const dicomTagPatientId = study?.['00100020']?.Value;
  if (Array.isArray(dicomTagPatientId) && dicomTagPatientId.length > 0) {
    return String(dicomTagPatientId[0]);
  }

  if (study?.PatientID) {
    return String(study.PatientID);
  }

  return null;
}

async function canPatientAccessStudy(patientId, studyInstanceUid) {
  const url = `${ORTHANC_TARGET}/dicom-web/studies/${encodeURIComponent(studyInstanceUid)}/metadata`;
  const upstreamResponse = await fetch(url);
  if (!upstreamResponse.ok) {
    return false;
  }

  const metadata = await upstreamResponse.json();
  return getPatientIdFromStudyMetadata(metadata) === String(patientId);
}

async function proxyDicomWeb(req, res, options = {}) {
  const upstreamUrl = `${ORTHANC_TARGET}${req.originalUrl}`;
  const headers = {
    accept: req.headers.accept || '*/*',
  };

  if (req.headers['content-type']) {
    headers['content-type'] = req.headers['content-type'];
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers,
  });

  if (options.filterStudiesByPatientId && req.method === 'GET') {
    const contentType = upstreamResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('application/dicom+json')) {
      const studies = await upstreamResponse.json();
      const filtered = Array.isArray(studies)
        ? studies.filter(
            (study) =>
              getPatientIdFromStudySummary(study) === String(options.filterStudiesByPatientId)
          )
        : [];

      return res.status(upstreamResponse.status).json(filtered);
    }
  }

  res.status(upstreamResponse.status);
  const responseContentType = upstreamResponse.headers.get('content-type');
  if (responseContentType) {
    res.setHeader('content-type', responseContentType);
  }

  const data = Buffer.from(await upstreamResponse.arrayBuffer());
  return res.send(data);
}

app.get('/login', (req, res) => {
  res.status(200).send(renderLogin(req.query.message || ''));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === DOCTOR_USER && password === DOCTOR_PASS) {
    req.session.authenticated = true;
    req.session.username = username;
    req.session.role = 'doctor';
    req.session.patientId = null;
    return res.redirect('/viewer');
  }

  const patient = PATIENT_USERS.find(
    (candidate) => candidate.username === username && candidate.password === password
  );
  if (patient?.patientId) {
    req.session.authenticated = true;
    req.session.username = patient.username;
    req.session.role = 'patient';
    req.session.patientId = String(patient.patientId);
    return res.redirect('/viewer');
  }

  return res.status(401).send(renderLogin('Credenciales inválidas.'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login?message=Sesión%20cerrada');
  });
});

app.get('/', (req, res) => {
  if (getSessionUser(req)) {
    return res.redirect('/viewer');
  }

  return res.redirect('/login');
});

app.get('/viewer', requireAuth, (req, res) => {
  const user = getSessionUser(req);
  return res.status(200).send(renderViewerShell(user));
});

const createAuthProxy = ({ target, pathRewrite, errorMessage }) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    pathRewrite,
    selfHandleResponse: true,
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const contentType = proxyRes.headers['content-type'] || '';
      if (req.method === 'GET' && contentType.includes('text/html')) {
        return injectViewerBranding(responseBuffer.toString('utf8'));
      }

      return responseBuffer;
    }),
    onError: (_, res) => {
      res.status(502).send(errorMessage);
    },
  });

app.use(
  '/ohif',
  requireAuth,
  createAuthProxy({
    target: OHIF_TARGET,
    pathRewrite: {
      '^/ohif': '',
    },
    errorMessage: 'No fue posible conectar con OHIF. Verifica que esté levantado en OHIF_TARGET.',
  })
);

app.use('/dicom-web', requireAuth, async (req, res) => {
  const user = getSessionUser(req);

  try {
    if (user.role === 'doctor') {
      return await proxyDicomWeb(req, res);
    }

    const studyPathMatch = req.path.match(/^\/studies\/([^/]+)/);
    if (studyPathMatch) {
      const studyUid = decodeURIComponent(studyPathMatch[1]);
      const canAccess = await canPatientAccessStudy(user.patientId, studyUid);
      if (!canAccess) {
        return res.status(403).json({ error: 'No autorizado para este estudio' });
      }

      return await proxyDicomWeb(req, res);
    }

    if (req.method === 'GET' && /^\/studies\/?$/.test(req.path)) {
      return await proxyDicomWeb(req, res, {
        filterStudiesByPatientId: user.patientId,
      });
    }

    return res.status(403).json({ error: 'No autorizado para este recurso' });
  } catch (error) {
    console.error('Error en proxy DICOMweb:', error);
    return res
      .status(502)
      .send('No fue posible conectar con Orthanc DICOMweb. Verifica que ORTHANC_TARGET esté levantado.');
  }
});

app.listen(PORT, () => {
  console.log(`Auth Service escuchando en http://localhost:${PORT}`);
  console.log(`Proxy activo hacia OHIF: ${OHIF_TARGET}`);
  console.log(`Proxy activo hacia Orthanc: ${ORTHANC_TARGET}`);
  console.log(`Paciente por defecto: ${PATIENT_USERS.map((u) => `${u.username}:${u.patientId}`).join(', ')}`);
});
