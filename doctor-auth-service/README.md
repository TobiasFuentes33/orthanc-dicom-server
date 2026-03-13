# Doctor Auth Service

Microservicio de autenticación para proteger el acceso a OHIF.

## Flujo

1. El doctor entra a `http://localhost:3000`.
2. Si no está autenticado, se muestra el panel de login.
3. Si intenta entrar a `/ohif` sin sesión, recibe el mensaje **"Necesita autenticarse"** y se le redirige al login.
4. Con credenciales válidas, el servicio hace proxy hacia OHIF (`OHIF_TARGET`).

## Variables de entorno

- `PORT`: puerto del servicio (default: `3000`)
- `SESSION_SECRET`: secreto de sesión
- `DOCTOR_USER`: usuario permitido
- `DOCTOR_PASS`: contraseña permitida
- `OHIF_TARGET`: URL interna de OHIF (ejemplo: `http://host.docker.internal:3001`)

## Ejecutar local

```bash
npm install
npm start
```

