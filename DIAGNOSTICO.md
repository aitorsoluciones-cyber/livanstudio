# Diagnóstico y entrega técnica

## Alcance
La entrega se ha construido como una versión separada y no destructiva. No se ha publicado ni conectado a producción.

## Riesgos todavía pendientes
- Faltan titular, NIF/CIF y domicilio fiscal.
- Las políticas legales necesitan validación con la operativa real.
- Las notificaciones de Netlify Forms deben configurarse y probarse en un despliegue.
- No hay IDs reales de GA4, Tag Manager o Ads; los eventos quedan preparados sin inventarlos.
- Los mockups visuales ayudan a vender el servicio, pero las fotografías de pedidos reales mejorarían la confianza.

## Estrategia implementada
- Recorrido por necesidad: regalo, empresa o diseño propio.
- Categorías con mensajes de WhatsApp específicos.
- Solicitud cualificada mediante producto, unidades, uso, fecha y contacto.
- Portada con CTA claros, catálogo visual y rutas para particulares y empresas.
- Página específica para empresas y página SEO local útil.
- Formularios con UTM, origen, fecha, honeypot, validación y adjunto.
- Arquitectura estática, rápida y sin dependencias externas.

## Mejora visual realizada
- Logotipo oficial integrado de forma consistente.
- Hero comercial con composición premium de productos.
- Tarjetas visuales para todas las categorías principales.
- Imágenes representativas en las páginas de producto.
- Galería honesta de ejemplos, diferenciada de trabajos reales.
- Imágenes responsive en WebP y carga diferida fuera del primer pantallazo.

## Conversiones preparadas
`whatsapp_click`, `request_quote`, `form_submit`, `email_click`, `product_view`, `business_quote`, `upload_design`, `generate_lead`.

## Pruebas imprescindibles en Deploy Preview
- Envío del formulario con y sin archivo.
- Recepción de notificación en `info@livanstudio.com`.
- Mensajes de WhatsApp en todas las categorías.
- Lighthouse móvil y escritorio.
- Datos estructurados y cabeceras HTTP.
