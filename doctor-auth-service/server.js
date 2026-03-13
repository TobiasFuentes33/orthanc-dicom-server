const express = require('express');
const session = require('express-session');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const OHIF_TARGET = process.env.OHIF_TARGET || 'http://orthanc:8042/ohif';
const ORTHANC_TARGET = process.env.ORTHANC_TARGET || 'http://orthanc:8042';
const DOCTOR_USER = process.env.DOCTOR_USER || 'doctor';
const DOCTOR_PASS = process.env.DOCTOR_PASS || 'doctor123';

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
    <title>Login Doctores</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f7fb; margin: 0; display: grid; place-items: center; min-height: 100vh; }
      .card { background: white; padding: 2rem; border-radius: 10px; width: 100%; max-width: 380px; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
      h1 { margin-top: 0; font-size: 1.4rem; }
      label { display: block; margin-bottom: .25rem; font-weight: 600; }
      input { width: 100%; padding: .6rem; margin-bottom: 1rem; border-radius: 8px; border: 1px solid #cfd6e4; }
      button { width: 100%; padding: .65rem; border: none; border-radius: 8px; background: #265dff; color: white; font-weight: 700; cursor: pointer; }
      .alert { margin-bottom: 1rem; color: #b42318; background: #fef3f2; border: 1px solid #fecdca; padding: .6rem; border-radius: 8px; }
      .hint { margin-top: 1rem; color: #344054; font-size: .85rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Panel de acceso para doctores</h1>
      ${message ? `<div class="alert">${message}</div>` : ''}
      <form method="post" action="/login">
        <label for="username">Usuario</label>
        <input id="username" name="username" required />

        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" required />

        <button type="submit">Entrar a OHIF</button>
      </form>
      <p class="hint">Si no estás autenticado, no podrás entrar a OHIF.</p>
    </div>
  </body>
</html>`;

function requireDoctorAuth(req, res, next) {
  if (req.session?.authenticated) {
    return next();
  }

  return res.redirect('/login?message=Necesita%20autenticarse');
}

app.get('/login', (req, res) => {
  res.status(200).send(renderLogin(req.query.message || ''));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === DOCTOR_USER && password === DOCTOR_PASS) {
    req.session.authenticated = true;
    req.session.username = username;
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
  if (req.session?.authenticated) {
    return res.redirect('/ohif/');
  }

  return res.redirect('/login');
});

const createDoctorProxy = ({ target, pathRewrite, errorMessage }) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    pathRewrite,
    onError: (_, res) => {
      res.status(502).send(errorMessage);
    },
  });

app.use(
  '/ohif',
  requireDoctorAuth,
  createDoctorProxy({
    target: OHIF_TARGET,
    pathRewrite: {
      '^/ohif': '',
    },
    errorMessage: 'No fue posible conectar con OHIF. Verifica que esté levantado en OHIF_TARGET.',
  })
);

app.use(
  '/dicom-web',
  requireDoctorAuth,
  createDoctorProxy({
    target: ORTHANC_TARGET,
    errorMessage:
      'No fue posible conectar con Orthanc DICOMweb. Verifica que ORTHANC_TARGET esté levantado.',
  })
);

app.listen(PORT, () => {
  console.log(`Doctor Auth Service escuchando en http://localhost:${PORT}`);
  console.log(`Proxy activo hacia OHIF: ${OHIF_TARGET}`);
  console.log(`Proxy activo hacia Orthanc: ${ORTHANC_TARGET}`);
});
