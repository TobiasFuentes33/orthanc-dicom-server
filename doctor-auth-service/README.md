# Auth Service (Doctores y Pacientes)

Microservicio de autenticación para proteger el acceso a OHIF con dos roles:

- **Doctor**: acceso completo a todos los estudios.
- **Paciente**: acceso limitado a estudios de su `PatientID`.

## Flujo

1. El usuario entra a `http://localhost:8042` (o `/ohif/`).
2. Si no está autenticado, se muestra el panel de login.
3. Con credenciales de **doctor**, el proxy permite todo el tráfico hacia OHIF + DICOMweb.
4. Con credenciales de **paciente**, el proxy:
   - filtra `GET /dicom-web/studies` para devolver solo estudios con su `PatientID`.
   - permite `/dicom-web/studies/:StudyInstanceUID/...` solo si el estudio pertenece al `PatientID` del paciente.
   - bloquea cualquier otro endpoint DICOMweb no asociado a su estudio (`fail-closed`).

## Variables de entorno

- `PORT`: puerto del servicio (default: `3000`)
- `SESSION_SECRET`: secreto de sesión
- `DOCTOR_USER`: usuario de doctor
- `DOCTOR_PASS`: contraseña de doctor
- `PATIENT_USERS_JSON`: arreglo JSON de pacientes. Ejemplo:

```json
[
  { "username": "paciente1", "password": "123456", "patientId": "P001" },
  { "username": "paciente2", "password": "abc123", "patientId": "P002" }
]
```

Si `PATIENT_USERS_JSON` no se define, se usan:

- `PATIENT_USER` (default `patient`)
- `PATIENT_PASS` (default `patient123`)
- `PATIENT_ID` (default `PATIENT-001`)

Además:

- `OHIF_TARGET`: URL interna de OHIF (por defecto: `http://orthanc:8042/ohif`)
- `ORTHANC_TARGET`: URL base interna de Orthanc para DICOMweb (por defecto: `http://orthanc:8042`)
- `CUSTOM_LOGO_URL`: ruta pública del logo personalizado para reemplazar el logo de OHIF (por defecto: `/branding/custom-logo.svg`)

## Ejecutar local

```bash
npm install
npm start
```


## Personalización UI aplicada

El gateway ahora inyecta personalizaciones en el HTML de OHIF para:

- ocultar el banner de *investigational use*.
- forzar idioma español en sesión (`i18nextLng = es`).
- ocultar el bloque de preferencia de idioma en la modal de preferencias.
- reemplazar el logo de OHIF por uno personalizado.

Por defecto se sirve un ejemplo en `doctor-auth-service/public/custom-logo.svg` y puedes reemplazarlo con tu archivo.
