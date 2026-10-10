/*
  Livan Studio · Tarifa web V1 (PROVISIONAL)
  ------------------------------------------------------------------
  Fuente de verdad de precios del configurador "Prepara tu pedido".
  Esta tarifa es provisional (estado: fixed_provisional).

  CÓMO ACTUALIZAR PRECIOS
  1. Todos los importes están en CÉNTIMOS de euro (17,90 € = 1790).
  2. Cada variante tiene `prices`: un importe por tramo, en el mismo orden
     que `tiers` (1, 5, 10, 25, 50, 100 unidades).
  3. Los suplementos (`extras`) son importes por unidad, también en céntimos.
  4. Los envíos están en `shipping`: `byKind` por tipo de producto
     (textil / fragil). `mode: 'quote'` significa "a presupuestar".
  5. IMPORTANTE: /assets/* se sirve con caché inmutable de un año. Tras editar
     este archivo hay que cambiar el valor de `?v=` en el <script> de
     pricing.js y order-builder.js en camisetas-personalizadas.html y
     tazas-personalizadas.html (por ejemplo ?v=v1-2).
  6. Sube también `version` para saber qué tarifa se está sirviendo.
*/
window.LIVAN_PRICING = {
  version: 'V1-provisional.2',
  status: 'fixed_provisional',
  currency: 'EUR',
  priceNote: 'Precio con IVA incluido · Envío aparte',
  reviewNote: 'El pedido se revisará antes de producir para confirmar archivo, disponibilidad y envío.',
  volumeNote: 'Pedido de volumen: revisaremos precio final antes de producir.',
  whatsappNumber: '34692899784',

  // Tramos por cantidad. Se usa el tramo más cercano hacia abajo.
  tiers: [1, 5, 10, 25, 50, 100],
  // A partir de esta cantidad el pedido se marca "a revisar".
  volumeFrom: 100,
  maxQuantity: 1000,
  // 'variant' -> el tramo suma las cantidades de todas las líneas con la misma
  //              variante de precio (mismo producto, técnica y posición/tamaño;
  //              la talla, el color y los extras no cambian la variante).
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

  products: {
    camisetas: {
      label: 'Camisetas personalizadas',
      itemSingular: 'camiseta',
      itemPlural: 'camisetas',
      shippingKind: 'textil',
      variantField: 'position',
      // Orden de los datos en el texto de cada línea del mensaje de WhatsApp.
      lineOrder: ['size', 'color', 'technique', 'position'],
      fields: [
        { id: 'type', label: 'Tipo', msg: false, options: [{ value: 'adulto', label: 'Camiseta adulto' }] },
        { id: 'technique', label: 'Técnica', options: [{ value: 'dtf', label: 'DTF' }] },
        {
          id: 'position', label: 'Posición y tamaño del diseño',
          options: [
            { value: 'pecho', label: 'Pecho pequeño ≤10×10 cm', msgLabel: 'Pecho ≤10×10' },
            { value: 'frontal', label: 'Frontal ≤A4', msgLabel: 'Frontal ≤A4' },
            { value: 'grande', label: 'Grande ≤A3', msgLabel: 'Grande ≤A3' }
          ]
        },
        {
          id: 'size', label: 'Talla', msgPrefix: 'Talla ',
          options: [
            { value: 'S', label: 'S' }, { value: 'M', label: 'M' }, { value: 'L', label: 'L' },
            { value: 'XL', label: 'XL' }, { value: 'XXL', label: 'XXL' }
          ]
        },
        {
          id: 'color', label: 'Color', msgPrefix: 'Color ', msgLower: true,
          options: [
            { value: 'blanco', label: 'Blanco' }, { value: 'negro', label: 'Negro' },
            { value: 'otro', label: 'Otro / consultar' }
          ]
        }
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
      file: {
        label: 'Archivo / diseño',
        options: [
          { value: 'listo', label: 'Tengo archivo listo', msgText: 'Tengo archivo listo y lo enviaré por WhatsApp.' },
          { value: 'logo-ayuda', label: 'Tengo logo pero necesito ayuda', msgText: 'Tengo un logo pero necesito ayuda para prepararlo; lo enviaré por WhatsApp.' },
          { value: 'idea', label: 'Solo tengo una idea', msgText: 'Solo tengo una idea y necesito orientación con el diseño.' },
          { value: 'repetir', label: 'Quiero repetir un diseño anterior', msgText: 'Quiero repetir un diseño anterior.' }
        ]
      }
    },

    tazas: {
      label: 'Tazas personalizadas',
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
      file: {
        label: 'Archivo / diseño',
        options: [
          { value: 'foto', label: 'Foto', msgText: 'Quiero personalizarla con una foto y la enviaré por WhatsApp.' },
          { value: 'texto', label: 'Texto', msgText: 'Quiero personalizarla con un texto; lo indicaré por WhatsApp.' },
          { value: 'logo', label: 'Logo', msgText: 'Quiero personalizarla con un logo y lo enviaré por WhatsApp.' },
          { value: 'idea', label: 'Tengo una idea', msgText: 'Solo tengo una idea y necesito orientación con el diseño.' },
          { value: 'repetir', label: 'Repetir diseño anterior', msgText: 'Quiero repetir un diseño anterior.' }
        ]
      }
    }
  }
};
