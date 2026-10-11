/*
  Livan Studio · Tarifa web V1 (PROVISIONAL)
  ------------------------------------------------------------------
  Fuente de verdad de precios del configurador "Prepara tu pedido"
  (páginas de camisetas, tazas y /pedidos.html).

  ESTADOS DE PRECIO (campo `status` de cada producto)
  - fixed_provisional : precio automático por tramos (tarifa provisional V1).
  - estimated         : precio orientativo; se confirma tras revisar el pedido.
  - quote_required    : a presupuesto, sin precio en la web.
  Una variante con `prices: null` (o un tramo con valor `null`) se trata como
  "a presupuestar". No se muestra ningún precio que no esté en esta tarifa.

  CÓMO ACTUALIZAR PRECIOS
  1. Todos los importes están en CÉNTIMOS de euro (17,90 € = 1790).
  2. Cada variante tiene `prices`: un importe por tramo, en el mismo orden
     que `tiers` (1, 5, 10, 25, 50, 100 unidades). `null` = a presupuestar.
  3. Los suplementos (`extras`) tienen `perUnit` (por unidad) y, opcionalmente,
     `fixed` (pago único por línea), también en céntimos.
  4. Los envíos están en `shipping`: `byKind` por tipo de producto
     (textil / fragil). `mode: 'quote'` significa "a presupuestar".
     En un pedido mixto se aplica el envío más alto de los tipos presentes.
  5. Tramos (`tierScope: 'variant'`): se suman las cantidades de las líneas con
     el mismo PRODUCTO y la misma VARIANTE DE PRECIO (`variantField`, o la
     combinación de `variantFields`). Nunca se mezclan productos distintos ni
     variantes distintas.
  6. IMPORTANTE: /assets/* se sirve con caché inmutable de un año. Tras editar
     este archivo hay que cambiar el valor de `?v=` en los <script> de
     pricing.js y order-builder.js en camisetas-personalizadas.html,
     tazas-personalizadas.html y pedidos.html (por ejemplo ?v=v2-3).
  7. Sube también `version` para saber qué tarifa se está sirviendo.
*/
(function () {
  'use strict';

  // Opciones compartidas por varios productos textiles.
  var SIZES = [
    { value: 'S', label: 'S' }, { value: 'M', label: 'M' }, { value: 'L', label: 'L' },
    { value: 'XL', label: 'XL' }, { value: 'XXL', label: 'XXL' }
  ];
  var COLORS = [
    { value: 'blanco', label: 'Blanco' }, { value: 'negro', label: 'Negro' },
    { value: 'otro', label: 'Otro / consultar' }
  ];
  var POSITIONS_3 = [
    { value: 'pecho', label: 'Pecho pequeño ≤10×10 cm', msgLabel: 'Pecho ≤10×10' },
    { value: 'frontal', label: 'Frontal ≤A4', msgLabel: 'Frontal ≤A4' },
    { value: 'grande', label: 'Grande ≤A3', msgLabel: 'Grande ≤A3' }
  ];
  var FILE_GENERIC = [
    { value: 'listo', label: 'Tengo archivo listo', msgText: 'Tengo archivo listo y lo enviaré por WhatsApp.' },
    { value: 'logo-ayuda', label: 'Tengo logo pero necesito ayuda', msgText: 'Tengo un logo pero necesito ayuda para prepararlo; lo enviaré por WhatsApp.' },
    { value: 'idea', label: 'Solo tengo una idea', msgText: 'Solo tengo una idea y necesito orientación con el diseño.' },
    { value: 'repetir', label: 'Quiero repetir un diseño anterior', msgText: 'Quiero repetir un diseño anterior.' }
  ];
  var FILE_MUG = [
    { value: 'foto', label: 'Foto', msgText: 'Quiero personalizarla con una foto y la enviaré por WhatsApp.' },
    { value: 'texto', label: 'Texto', msgText: 'Quiero personalizarla con un texto; lo indicaré por WhatsApp.' },
    { value: 'logo', label: 'Logo', msgText: 'Quiero personalizarla con un logo y lo enviaré por WhatsApp.' },
    { value: 'idea', label: 'Tengo una idea', msgText: 'Solo tengo una idea y necesito orientación con el diseño.' },
    { value: 'repetir', label: 'Repetir diseño anterior', msgText: 'Quiero repetir un diseño anterior.' }
  ];
  function pending(label) { return { label: label, prices: null }; }

  // Tarifa de bordado (suplementos, en céntimos). Los bordados grandes o
  // complejos NO se automatizan: se piden como "Bordados grandes" (a presupuesto).
  var EMBROIDERY = {
    nameSmall: 490,       // nombre / texto pequeño
    logoSmall: 690,       // logo pequeño ≈ ≤8.000 puntadas
    digitizing: 3000,     // digitalización del logo, primera vez (pago único)
    digitizedBefore: 0    // logo ya digitalizado en un pedido anterior
  };

  // Gorras: precio de referencia DTF frontal (orientativo).
  var CAP_DTF_PRICES = [1590, 1390, 1190, 1090, 990, 890];

  window.LIVAN_PRICING = {
    version: 'V1-provisional.5',
    status: 'fixed_provisional',
    currency: 'EUR',
    priceNote: 'Precio con IVA incluido · Envío aparte',
    reviewNote: 'El pedido se revisará antes de producir para confirmar archivo, disponibilidad y envío.',
    volumeNote: 'Pedido de volumen: revisaremos precio final antes de producir.',
    // Aviso de los productos con precio orientativo (estimated).
    estimateNote: 'Precio orientativo. Te confirmaremos el importe final tras revisar producto, archivo, cantidad y disponibilidad.',
    multiLogoNote: 'Hay varios logos o textos distintos en gorras bordadas: el precio queda sujeto a revisión manual (la digitalización se confirma por logo).',
    estimateTotalNote: 'El total incluye precios orientativos. Te confirmaremos el importe final tras revisar producto, archivo, cantidad y disponibilidad.',
    whatsappNumber: '34692899784',

    // Tramos por cantidad. Se usa el tramo más cercano hacia abajo.
    tiers: [1, 5, 10, 25, 50, 100],
    // A partir de esta cantidad el pedido se marca "a revisar".
    volumeFrom: 100,
    maxQuantity: 1000,
    // 'variant' -> el tramo suma las cantidades de todas las líneas con el mismo
    //              producto y la misma variante de precio; la talla, el color y
    //              los extras no cambian la variante.
    //              Decisión comercial vigente: 5 M + 2 L frontal A4 = 7 uds, tramo de 5.
    // 'line'    -> el tramo depende solo de la cantidad de cada línea.
    tierScope: 'variant',

    shipping: {
      recogida: { label: 'Recogida en Rubí', mode: 'fixed', byKind: { textil: 0, fragil: 0 }, needsAddress: false },
      peninsula: { label: 'Envío a domicilio · España peninsular', mode: 'from', byKind: { textil: 790, fragil: 990 }, needsAddress: true },
      islas: { label: 'Baleares / Canarias / Ceuta / Melilla', mode: 'quote', needsAddress: true },
      consultar: { label: 'Envío a consultar', mode: 'quote', needsAddress: false }
    },

    payments: [
      { value: 'bizum', label: 'Bizum' },
      { value: 'transferencia', label: 'Transferencia' },
      { value: 'paypal', label: 'PayPal' },
      { value: 'enlace', label: 'Enlace de pago' }
    ],

    // Textos de los estados de precio (UI).
    statusLabels: {
      fixed_provisional: 'Precio automático',
      estimated: 'Precio orientativo',
      quote_required: 'A presupuesto'
    },

    // Bordado: suplementos de referencia (los usan los productos bordados).
    embroidery: EMBROIDERY,

    // El orden de las claves es el orden del catálogo (selector, resumen y mensaje).
    products: {
      /* ================= Precio automático (tarifa V1) ================= */
      camisetas: {
        label: 'Camisetas personalizadas',
        status: 'fixed_provisional',
        itemSingular: 'camiseta',
        itemPlural: 'camisetas',
        shippingKind: 'textil',
        variantField: 'position',
        // Orden de los datos en el texto de cada línea del mensaje de WhatsApp.
        lineOrder: ['size', 'color', 'technique', 'position'],
        fields: [
          { id: 'type', label: 'Tipo', msg: false, options: [{ value: 'adulto', label: 'Camiseta adulto' }] },
          { id: 'technique', label: 'Técnica', options: [{ value: 'dtf', label: 'DTF' }] },
          { id: 'position', label: 'Posición y tamaño del diseño', options: POSITIONS_3 },
          { id: 'size', label: 'Talla', msgPrefix: 'Talla ', options: SIZES },
          { id: 'color', label: 'Color', msgPrefix: 'Color ', msgLower: true, options: COLORS }
        ],
        variants: {
          pecho: { label: 'Camiseta adulto · DTF pecho ≤10×10', prices: [1790, 1590, 1390, 1190, 1090, 990] },
          frontal: { label: 'Camiseta adulto · DTF frontal ≤A4', prices: [2190, 1990, 1690, 1490, 1390, 1290] },
          grande: { label: 'Camiseta adulto · DTF grande ≤A3', prices: [2390, 2190, 1890, 1690, 1590, 1490] }
        },
        // Suplementos por unidad, en céntimos.
        extras: {
          label: 'Extras',
          options: [
            { value: 'ninguno', label: 'Ninguno', perUnit: 0 },
            { value: 'zona2-pequena', label: 'Segunda zona DTF pequeña', perUnit: 350 },
            { value: 'zona2-a4', label: 'Segunda zona DTF hasta A4', perUnit: 550 },
            { value: 'zona2-a3', label: 'Segunda zona DTF hasta A3', perUnit: 750 },
            { value: 'nombre', label: 'Nombre individual DTF', perUnit: 290 },
            { value: 'dorsal', label: 'Dorsal individual', perUnit: 390 },
            { value: 'nombre-dorsal', label: 'Nombre + dorsal', perUnit: 590 },
            { value: 'manga', label: 'Manga pequeña / logo adicional', perUnit: 350 }
          ]
        },
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },

      tazas: {
        label: 'Tazas personalizadas',
        status: 'fixed_provisional',
        itemSingular: 'taza',
        itemPlural: 'tazas',
        shippingKind: 'fragil',
        variantField: 'type',
        fields: [
          { id: 'type', label: 'Tipo', options: [{ value: 'blanca-325', label: 'Taza blanca 325 ml' }] },
          { id: 'technique', label: 'Técnica', options: [{ value: 'sublimacion', label: 'Sublimación' }] },
          {
            // Sin suplemento por una cara / dos caras / envolvente mientras encaje en el área imprimible.
            id: 'design', label: 'Diseño',
            options: [
              { value: 'una-cara', label: 'Una cara', msgLabel: 'Una cara' },
              { value: 'dos-caras', label: 'Dos caras', msgLabel: 'Dos caras' },
              { value: 'envolvente', label: 'Envolvente', msgLabel: 'Envolvente' }
            ]
          }
        ],
        variants: {
          'blanca-325': { label: 'Taza blanca 325 ml · sublimación', prices: [1290, 1090, 890, 790, 690, 590] }
        },
        extras: null,
        file: { label: 'Archivo / diseño', options: FILE_MUG }
      },

      'tote-bags': {
        label: 'Tote bags personalizadas',
        status: 'fixed_provisional',
        itemSingular: 'tote bag',
        itemPlural: 'tote bags',
        shippingKind: 'textil',
        variantField: 'design',
        lineOrder: ['type', 'color', 'technique', 'design'],
        info: 'Tote bag de algodón (140 g aprox.) con DTF en una cara. La segunda cara se presupuesta.',
        fields: [
          { id: 'type', label: 'Tipo', options: [{ value: 'tote-140', label: 'Tote bag de algodón (140 g aprox.)', msgLabel: 'Tote bag 140 g aprox.' }] },
          { id: 'technique', label: 'Técnica', options: [{ value: 'dtf', label: 'DTF' }] },
          {
            id: 'design', label: 'Caras personalizadas',
            options: [
              { value: 'una-cara', label: 'Una cara (frontal)', msgLabel: 'Una cara' },
              { value: 'dos-caras', label: 'Dos caras · a presupuesto', msgLabel: 'Dos caras' }
            ]
          },
          {
            id: 'color', label: 'Color de la bolsa', msgPrefix: 'Color ', msgLower: true,
            options: [{ value: 'natural', label: 'Natural' }, { value: 'negro', label: 'Negro' }, { value: 'otro', label: 'Otro / consultar' }]
          }
        ],
        variants: {
          'una-cara': { label: 'Tote 140 g aprox. · DTF 1 cara', prices: [1190, 1090, 990, 890, 790, 690] },
          'dos-caras': pending('Tote · DTF 2 caras')
        },
        extras: null,
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },

      polos: {
        label: 'Polos personalizados',
        status: 'fixed_provisional',
        itemSingular: 'polo',
        itemPlural: 'polos',
        shippingKind: 'textil',
        variantField: 'position',
        lineOrder: ['size', 'color', 'technique', 'position'],
        info: 'Precio automático solo para logo en pecho. Otras posiciones se presupuestan.',
        fields: [
          { id: 'type', label: 'Tipo', msg: false, options: [{ value: 'adulto', label: 'Polo adulto' }] },
          { id: 'technique', label: 'Técnica', options: [{ value: 'dtf', label: 'DTF' }] },
          {
            id: 'position', label: 'Posición y tamaño del diseño',
            options: [
              { value: 'pecho', label: 'Logo en pecho (pequeño ≤10×10 cm)', msgLabel: 'Logo pecho' },
              { value: 'frontal', label: 'Frontal ≤A4 · a presupuesto', msgLabel: 'Frontal ≤A4' }
            ]
          },
          { id: 'size', label: 'Talla', msgPrefix: 'Talla ', options: SIZES },
          { id: 'color', label: 'Color', msgPrefix: 'Color ', msgLower: true, options: COLORS }
        ],
        variants: {
          pecho: { label: 'Polo · DTF logo pecho', prices: [2490, 2290, 2090, 1890, 1790, 1690] },
          frontal: pending('Polo · DTF frontal ≤A4')
        },
        extras: null,
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },

      sudaderas: {
        label: 'Sudaderas personalizadas',
        status: 'fixed_provisional',
        itemSingular: 'sudadera',
        itemPlural: 'sudaderas',
        shippingKind: 'textil',
        // El precio depende del tipo de sudadera Y de la posición: variante compuesta.
        variantFields: ['type', 'position'],
        lineOrder: ['type', 'size', 'color', 'technique', 'position'],
        info: 'El precio depende del tipo de sudadera. Precio automático solo para logo en pecho; otras posiciones se presupuestan.',
        fields: [
          {
            id: 'type', label: 'Tipo',
            options: [{ value: 'redonda', label: 'Sudadera cuello redondo' }, { value: 'capucha', label: 'Sudadera con capucha' }]
          },
          { id: 'technique', label: 'Técnica', options: [{ value: 'dtf', label: 'DTF' }] },
          {
            id: 'position', label: 'Posición y tamaño del diseño',
            options: [
              { value: 'pecho', label: 'Logo en pecho (pequeño ≤10×10 cm)', msgLabel: 'Logo pecho' },
              { value: 'frontal', label: 'Frontal ≤A4 · a presupuesto', msgLabel: 'Frontal ≤A4' },
              { value: 'grande', label: 'Grande ≤A3 · a presupuesto', msgLabel: 'Grande ≤A3' }
            ]
          },
          { id: 'size', label: 'Talla', msgPrefix: 'Talla ', options: SIZES },
          { id: 'color', label: 'Color', msgPrefix: 'Color ', msgLower: true, options: COLORS }
        ],
        variants: {
          'redonda|pecho': { label: 'Sudadera cuello redondo · DTF pecho', prices: [3490, 3290, 2990, 2790, 2590, 2490] },
          'capucha|pecho': { label: 'Sudadera capucha · DTF pecho', prices: [3990, 3790, 3490, 3290, 3090, 2990] },
          'redonda|frontal': pending('Sudadera cuello redondo · DTF frontal ≤A4'),
          'capucha|frontal': pending('Sudadera capucha · DTF frontal ≤A4'),
          'redonda|grande': pending('Sudadera cuello redondo · DTF grande ≤A3'),
          'capucha|grande': pending('Sudadera capucha · DTF grande ≤A3')
        },
        extras: null,
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },

      /* ================= Precio orientativo (estimated) ================= */
      'gorras-dtf': {
        label: 'Gorras personalizadas (DTF)',
        status: 'estimated',
        itemSingular: 'gorra',
        itemPlural: 'gorras',
        shippingKind: 'textil',
        variantField: 'technique',
        lineOrder: ['type', 'color', 'technique', 'position'],
        estimateNote: 'Precio orientativo. Revisaremos el modelo de gorra y el archivo antes de producir.',
        fields: [
          { id: 'type', label: 'Tipo', msg: false, options: [{ value: 'gorra', label: 'Gorra' }] },
          { id: 'technique', label: 'Técnica', options: [{ value: 'dtf', label: 'DTF' }] },
          { id: 'position', label: 'Posición', options: [{ value: 'frontal', label: 'Frontal', msgLabel: 'Frontal' }] },
          { id: 'color', label: 'Color', msgPrefix: 'Color ', msgLower: true, options: COLORS }
        ],
        variants: { dtf: { label: 'Gorra · DTF frontal', prices: CAP_DTF_PRICES } },
        extras: null,
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },

      'gorras-bordado': {
        label: 'Gorras bordadas',
        status: 'estimated',
        itemSingular: 'gorra',
        itemPlural: 'gorras',
        shippingKind: 'textil',
        variantField: 'technique',
        lineOrder: ['type', 'color', 'technique'],
        // Si hay varios logos o textos distintos (campo `detail`), el pedido queda sujeto a revisión manual.
        multiLogoReview: true,
        estimateNote: 'Precio orientativo de bordado: revisaremos el modelo de gorra, el logo y las puntadas antes de producir.',
        info: 'Precio orientativo: incluye la gorra y el bordado de un logo o texto pequeño. La digitalización del logo (30,00 €, pago único) solo se cobra la primera vez. Si pides varios logos distintos, el precio queda sujeto a revisión manual. Para logos grandes o complejos usa «Bordados grandes» (a presupuesto).',
        fields: [
          { id: 'type', label: 'Tipo', msg: false, options: [{ value: 'gorra', label: 'Gorra' }] },
          { id: 'technique', label: 'Técnica', options: [{ value: 'bordado', label: 'Bordado' }] },
          { id: 'color', label: 'Color', msgPrefix: 'Color ', msgLower: true, options: COLORS }
        ],
        // Base de referencia = tabla de gorra DTF frontal; el bordado va como suplemento (extras).
        variants: { bordado: { label: 'Gorra · bordado logo pequeño (base de referencia)', prices: CAP_DTF_PRICES } },
        extras: {
          label: 'Bordado',
          required: true,
          options: [
            { value: 'logo-nuevo', label: 'Logo pequeño ≤8.000 puntadas · primera vez', perUnit: EMBROIDERY.logoSmall, fixed: EMBROIDERY.digitizing },
            { value: 'logo-digitalizado', label: 'Logo pequeño ≤8.000 puntadas · ya digitalizado', perUnit: EMBROIDERY.logoSmall, fixed: EMBROIDERY.digitizedBefore },
            { value: 'nombre-texto', label: 'Nombre / texto pequeño', perUnit: EMBROIDERY.nameSmall, fixed: 0 }
          ]
        },
        detail: { label: 'Logo o texto a bordar', placeholder: 'Por ejemplo: logo del club o el texto «Bar Pepe». Si son varios logos, ponlos en líneas distintas.' },
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },

      termos: {
        label: 'Termos personalizados',
        status: 'estimated',
        itemSingular: 'termo',
        itemPlural: 'termos',
        shippingKind: 'fragil',
        variantField: 'type',
        fields: [
          { id: 'type', label: 'Tipo', options: [{ value: 'sublimable-500', label: 'Termo sublimable 500 ml' }] },
          { id: 'technique', label: 'Técnica', options: [{ value: 'sublimacion', label: 'Sublimación' }] },
          {
            id: 'design', label: 'Diseño',
            options: [
              { value: 'una-cara', label: 'Una cara', msgLabel: 'Una cara' },
              { value: 'envolvente', label: 'Envolvente', msgLabel: 'Envolvente' }
            ]
          }
        ],
        variants: { 'sublimable-500': { label: 'Termo sublimable 500 ml', prices: [1990, 1890, 1690, 1490, 1390, 1290] } },
        extras: null,
        file: { label: 'Archivo / diseño', options: FILE_MUG }
      },

      'equipaciones-dtf': {
        label: 'Equipaciones personalizadas (DTF)',
        status: 'estimated',
        itemSingular: 'equipación',
        itemPlural: 'equipaciones',
        shippingKind: 'textil',
        variantField: 'type',
        lineOrder: ['type', 'size', 'color', 'technique'],
        info: 'Incluye camiseta, short, escudo, nombre y dorsal en DTF. Segundo pantalón y medias: a presupuestar (indícalo en los comentarios). A partir de 100 unidades se presupuesta.',
        fields: [
          {
            id: 'type', label: 'Tipo',
            options: [{ value: 'tecnica', label: 'Equipación técnica: camiseta + short + escudo + nombre + dorsal', msgLabel: 'Equipación técnica (camiseta + short + escudo + nombre + dorsal)' }]
          },
          { id: 'technique', label: 'Técnica', options: [{ value: 'dtf', label: 'DTF' }] },
          { id: 'size', label: 'Talla', msgPrefix: 'Talla ', options: SIZES },
          { id: 'color', label: 'Color', msgPrefix: 'Color ', msgLower: true, options: COLORS }
        ],
        // 100 unidades: a presupuestar (valor null).
        variants: { tecnica: { label: 'Equipación técnica DTF', prices: [3990, 3490, 3190, 2990, 2790, null] } },
        // Patrocinadores (por unidad, en céntimos).
        extras: {
          label: 'Sponsors',
          options: [
            { value: 'ninguno', label: 'Sin sponsor', perUnit: 0 },
            { value: 'frontal', label: 'Sponsor frontal', perUnit: 350 },
            { value: 'espalda', label: 'Sponsor espalda', perUnit: 350 },
            { value: 'manga', label: 'Sponsor manga', perUnit: 290 },
            { value: 'frontal-espalda', label: 'Sponsor frontal + espalda', perUnit: 700 },
            { value: 'frontal-manga', label: 'Sponsor frontal + manga', perUnit: 640 },
            { value: 'espalda-manga', label: 'Sponsor espalda + manga', perUnit: 640 },
            { value: 'frontal-espalda-manga', label: 'Sponsor frontal + espalda + manga', perUnit: 990 }
          ]
        },
        detail: { label: 'Nombres, dorsales y escudo', placeholder: 'Por ejemplo: lista de nombres y dorsales, color del equipo, escudo…' },
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },

      /* ================= A presupuesto (sin precio en la web) ================= */
      'uniformes-complejos': {
        label: 'Uniformes complejos',
        status: 'quote_required',
        shippingKind: 'textil',
        variantField: null,
        fields: [],
        variants: null,
        extras: null,
        detail: { label: 'Cuéntanos qué necesitas', placeholder: 'Prendas, logotipos, personalización por persona, fecha…' },
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },
      'equipaciones-sublimadas': {
        label: 'Equipaciones sublimadas integrales',
        status: 'quote_required',
        shippingKind: 'textil',
        variantField: null,
        fields: [],
        variants: null,
        extras: null,
        detail: { label: 'Cuéntanos qué necesitas', placeholder: 'Deporte, nº de jugadores, diseño integral, tallas…' },
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },
      'bordados-grandes': {
        label: 'Bordados grandes',
        status: 'quote_required',
        shippingKind: 'textil',
        variantField: null,
        fields: [],
        variants: null,
        extras: null,
        detail: { label: 'Cuéntanos qué necesitas', placeholder: 'Prenda, tamaño aproximado del bordado, logotipo…' },
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      },
      'disenos-complejos': {
        label: 'Diseños complejos',
        status: 'quote_required',
        shippingKind: 'textil',
        variantField: null,
        fields: [],
        variants: null,
        extras: null,
        detail: { label: 'Cuéntanos qué necesitas', placeholder: 'Producto, tipo de diseño, nº de diseños distintos…' },
        file: { label: 'Archivo / diseño', options: FILE_GENERIC }
      }
    }
  };
})();
