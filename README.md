# Livan Studio Personalizados — web comercial para Netlify

Versión estática optimizada para captar pedidos, presupuestos y conversaciones cualificadas por WhatsApp. No se ha publicado en producción.

## Qué incluye
- Portada comercial con rutas diferenciadas para regalos, empresas y diseños propios.
- Páginas de camisetas, uniformes, tazas, gorras, regalos, merchandising e impresión DTF.
- Logotipo oficial integrado en cabecera, pie, favicon y datos estructurados.
- 24 imágenes WebP responsive optimizadas a 640 y 1280 px.
- Mockups visuales identificados como ejemplos, sin presentarlos como pedidos reales de clientes.
- Formularios Netlify con adjunto, honeypot, campos UTM y página de agradecimiento.
- SEO técnico, SEO local, datos estructurados, sitemap, robots y Open Graph.
- Eventos preparados en `dataLayer`, sin IDs falsos.
- Cabeceras de seguridad y caché.

## Antes de publicar
1. Completar titular o razón social, NIF/CIF y domicilio fiscal.
2. Revisar las políticas legales con los datos y operativa reales.
3. Configurar en Netlify la notificación de formularios a `info@livanstudio.com`.
4. Crear un Deploy Preview y enviar un formulario real con archivo adjunto.
5. Confirmar DNS y SSL de `livanstudio.com` y `livanpersonalizados.com`.
6. Sustituir o ampliar los mockups con fotografías reales autorizadas cuando estén disponibles.

## Publicación recomendada
1. Crea una rama `redesign-conversion` en el repositorio conectado a Netlify.
2. Copia estos archivos y haz commit.
3. Abre un Pull Request hacia la rama de producción.
4. Revisa el Deploy Preview.
5. Publica únicamente después de probar formularios, WhatsApp, móvil y correo.

## Reversión
- Con Git: revierte el merge o vuelve a desplegar el commit anterior.
- En Netlify: `Deploys` → selecciona el despliegue anterior → `Publish deploy`.
