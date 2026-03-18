const express = require('express');
const session = require('express-session');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const OHIF_TARGET = process.env.OHIF_TARGET || 'http://orthanc:8042/ohif';
const ORTHANC_TARGET = process.env.ORTHANC_TARGET || 'http://orthanc:8042';
const DOCTOR_USER = process.env.DOCTOR_USER || 'doctor';
const DOCTOR_PASS = process.env.DOCTOR_PASS || 'doctor123';

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOhifUserBarMarkup(user) {
  if (!user) {
    return '';
  }

  const roleLabel = user.role === 'doctor' ? 'Doctor' : 'Paciente';
  const patientInfo = user.patientId ? `<span class="ohif-session-pill">PatientID: ${escapeHtml(user.patientId)}</span>` : '';

  return `
    <style>
      body { margin-top: 48px; }
      #ohif-session-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 48px;
        padding: 8px 16px;
        box-sizing: border-box;
        background: #111827;
        color: #f9fafb;
        font-family: Arial, sans-serif;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      }
      .ohif-session-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .ohif-session-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        font-size: 12px;
      }
      .ohif-session-user {
        font-weight: 700;
      }
      .ohif-session-logout {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        color: #111827;
        background: #f9fafb;
        font-weight: 700;
      }
      .ohif-session-logout:hover {
        background: #e5e7eb;
      }
    </style>
    <div id="ohif-session-bar">
      <div class="ohif-session-meta">
        <span class="ohif-session-pill">${escapeHtml(roleLabel)}</span>
        <span>Usuario conectado: <span class="ohif-session-user">${escapeHtml(user.username)}</span></span>
        ${patientInfo}
      </div>
      <form method="post" action="/logout" style="margin: 0;">
        <button type="submit" class="ohif-session-logout">Cerrar sesión</button>
      </form>
    </div>
  `;
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
    return res.redirect('/ohif/');
  }

  const patient = PATIENT_USERS.find(
    (candidate) => candidate.username === username && candidate.password === password
  );
  if (patient?.patientId) {
    req.session.authenticated = true;
    req.session.username = patient.username;
    req.session.role = 'patient';
    req.session.patientId = String(patient.patientId);
    return res.redirect('/ohif/');
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
    return res.redirect('/ohif/');
  }

  return res.redirect('/login');
});

const createAuthProxy = ({ target, pathRewrite, errorMessage }) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    selfHandleResponse: true,
    pathRewrite,
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req) => {
      const contentType = proxyRes.headers['content-type'] || '';

      if (!contentType.includes('text/html')) {
        return responseBuffer;
      }

      const html = responseBuffer.toString('utf8');
      const userBarMarkup = buildOhifUserBarMarkup(getSessionUser(req));
      if (!userBarMarkup || html.includes('id="ohif-session-bar"')) {
        return html;
      }

      return html.replace('</body>', `${userBarMarkup}</body>`);
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
