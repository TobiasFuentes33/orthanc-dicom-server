# orthanc-dicom-server

## Por qué tus cambios no se reflejaban

Sí: **el problema principal era que Docker estaba ejecutando imágenes/contenedores, no tus archivos locales directamente**.

### Estado original del proyecto

- `orthanc` usaba la imagen publicada `orthancteam/orthanc:latest`.
- `auth-gateway` sí se construía desde `./doctor-auth-service`, pero el código se copiaba dentro de la imagen en build-time.
- La carpeta `./ohif` **no estaba conectada** al `docker-compose.yml` principal, por lo que cualquier cambio allí no podía verse en ejecución.

Eso significa:

1. Si cambiabas archivos de `doctor-auth-service`, tenías que reconstruir o reiniciar el contenedor para ver cambios.
2. Si cambiabas archivos dentro de `ohif`, **no se iba a reflejar nada**, porque el stack activo estaba usando el OHIF embebido dentro de la imagen de Orthanc, no tu copia local del repositorio.

## Archivos importantes

- Stack base: `docker-compose.yml`
- Modo desarrollo local con hot reload: `docker-compose.dev.yml`
- Auth service: `doctor-auth-service/`
- Código local de OHIF: `ohif/`

## Cómo trabajar ahora

### Modo normal

```bash
docker compose up --build
```

Este modo sigue siendo útil si solo quieres levantar el stack rápidamente.

### Modo desarrollo local

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Con esta combinación:

- `doctor-auth-service` se monta como volumen y corre con `node --watch`.
- Se levanta un servicio nuevo llamado `ohif-local` usando tu carpeta `./ohif`.
- `auth-gateway` deja de apuntar al OHIF embebido de Orthanc y pasa a apuntar al OHIF local.

## Qué cambia en desarrollo

### `doctor-auth-service`

Ahora los cambios en:

- `doctor-auth-service/server.js`
- `doctor-auth-service/package.json`

se reflejan sin reconstruir la imagen completa, porque el contenedor monta el directorio local y usa modo watch.

### `ohif`

Ahora los cambios en la carpeta `ohif/` sí forman parte del entorno activo cuando usas `docker-compose.dev.yml`, porque se arranca un servidor de desarrollo local (`yarn dev:orthanc`) y el gateway apunta a ese servicio.

## Importante sobre Orthanc

El servicio `orthanc` sigue usando una imagen Docker publicada. Si quieres modificar el comportamiento interno de Orthanc más allá de variables de entorno, necesitarías:

- crear un `Dockerfile` propio para Orthanc, o
- montar archivos de configuración/plugins explícitamente.

En el estado actual del proyecto, **los cambios del repositorio que sí estaban desconectados del runtime eran principalmente los de `ohif/`**, y los de `doctor-auth-service/` requerían rebuild/restart porque estaban baked dentro de la imagen.
