# Pruebas realizadas

Fecha: 30 de junio de 2026

## Validación estructural
- 21 páginas HTML revisadas.
- Un único H1 por página.
- Sin identificadores HTML duplicados.
- Sin enlaces internos ni recursos locales rotos.
- Todas las imágenes tienen texto alternativo y dimensiones declaradas.
- Canonical y meta description presentes.
- JSON-LD analizado correctamente.
- Formularios con etiquetas accesibles, honeypot y detección estática de Netlify.
- JavaScript validado con `node --check`.
- CSS analizado sin errores de sintaxis.

## Revisión visual automatizada
Se renderizaron las 21 páginas en dos tamaños:
- Escritorio: 1440 × 1000 px.
- Móvil: 390 × 844 px.

Resultado de 42 comprobaciones:
- 0 desbordamientos horizontales.
- 0 imágenes rotas.
- 0 errores de JavaScript en consola.
- 0 errores de ejecución de página.
- Menú móvil abre, cierra y responde a la tecla Escape.

También se revisaron capturas específicas de:
- Hero y navegación.
- Tarjetas de categorías.
- Galería de ejemplos.
- Bloques para particulares y empresas.
- Formularios en escritorio y móvil.
- Páginas de producto y empresa.

## Rendimiento del paquete
- Sitio completo: aproximadamente 1,5 MB.
- Imágenes de producto: aproximadamente 0,95 MB en total.
- `index.html`: aproximadamente 27 KB sin comprimir.
- `styles.css`: aproximadamente 19 KB sin comprimir.
- Sin fuentes externas, frameworks, trackers ni vídeos.

## Lighthouse
No se incluye una puntuación inventada. Debe ejecutarse sobre el Deploy Preview real, donde también podrán comprobarse las cabeceras HTTP y el comportamiento de Netlify Forms.

```bash
npx lighthouse https://URL-DEL-DEPLOY-PREVIEW.netlify.app \
  --view \
  --only-categories=performance,accessibility,best-practices,seo
```

## Pendiente en Deploy Preview
1. Enviar el formulario rápido.
2. Enviar el formulario completo con un archivo real.
3. Confirmar la notificación en `info@livanstudio.com`.
4. Abrir los mensajes de WhatsApp desde un teléfono real.
5. Ejecutar Lighthouse en móvil y escritorio.
6. Validar datos estructurados y cabeceras HTTP publicadas.
