# Plan de medición

No se han añadido IDs falsos de GA4, Google Tag Manager ni Google Ads.

## Eventos preparados en `dataLayer`
- `whatsapp_click`: clic en cualquier acceso a WhatsApp.
- `request_quote`: acceso al formulario de presupuesto.
- `form_submit`: envío válido de formulario.
- `email_click`: clic en el correo electrónico.
- `product_view`: visualización de una página de producto o servicio.
- `business_quote`: solicitud específica para empresa.
- `upload_design`: intención de enviar un diseño.
- `generate_lead`: solicitud enviada con los campos obligatorios.

## Atributos registrados
- Ruta de la página.
- Producto cuando está disponible.
- `utm_source`.
- `utm_medium`.
- `utm_campaign`.
- `utm_content`.
- Página de entrada.
- Referente.
- Fuente del lead.
- Fecha y hora del envío.

Los enlaces de WhatsApp añaden al mensaje la página de origen y, cuando existen, la fuente y la campaña.

## Conversiones principales
1. `generate_lead`.
2. `business_quote`.
3. `whatsapp_click` desde páginas de producto.
4. `upload_design`.

## Indicadores recomendados
- Solicitudes cualificadas por semana.
- Porcentaje de solicitudes con producto, unidades, uso y fecha.
- Conversión de página de producto a WhatsApp.
- Conversión de visita a formulario enviado.
- Leads por fuente y campaña.
- Presupuestos aceptados por categoría.
- Valor medio de pedido y repetición de clientes, cuando exista un sistema de ventas.

## Antes de instalar analítica
- Obtener los IDs reales.
- Definir responsables y finalidad del tratamiento.
- Implantar consentimiento cuando corresponda.
- Actualizar privacidad y cookies.
- Verificar que la CSP permite únicamente los dominios necesarios.
