/*
  Livan Studio · Prepara tu pedido (MVP 1: camisetas y tazas)
  ------------------------------------------------------------------
  - Calcula precios con la tarifa de /assets/data/pricing.js (en céntimos).
  - No hay pago, carrito ni checkout: prepara el pedido y abre WhatsApp con
    el mensaje ya redactado. El cliente decide si lo envía.
  - No guarda datos personales (ni localStorage ni cookies).
  - Sin dependencias, sin estilos inline (CSP: style-src 'self').

  El núcleo de cálculo (LivanOrder) es independiente del DOM para poder
  probarlo con Node.
*/
(function (root) {
  'use strict';

  function pricing() { return root.LIVAN_PRICING; }

  /* ---------- Utilidades ---------- */

  // 1790 -> "17,90 €"  |  123456 -> "1.234,56 €"
  function money(cents) {
    var c = Math.round(Math.abs(cents));
    var euros = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var dec = c % 100;
    return (cents < 0 ? '-' : '') + euros + ',' + (dec < 10 ? '0' : '') + dec + ' €';
  }
  function moneyUI(cents) { return money(cents).replace(' €', ' €'); }

  function oneLine(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 120);
  }
  function multiLine(s, max) {
    return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max || 500);
  }

  function findOption(options, value) {
    for (var i = 0; i < options.length; i++) if (options[i].value === value) return options[i];
    return null;
  }
  function fieldOf(prod, id) {
    for (var i = 0; i < prod.fields.length; i++) if (prod.fields[i].id === id) return prod.fields[i];
    return null;
  }

  /* ---------- Cálculo ---------- */

  // Tramo más cercano hacia abajo: 1-4 -> 0, 5-9 -> 1, 10-24 -> 2 ...
  function tierIndex(qty) {
    var tiers = pricing().tiers, idx = 0;
    for (var i = 0; i < tiers.length; i++) if (qty >= tiers[i]) idx = i;
    return idx;
  }

  function variantKey(prod, values) { return values[prod.variantField] || ''; }

  function shippingFor(prod, deliveryKey) {
    var P = pricing(), s = P.shipping[deliveryKey];
    if (!s) return { key: '', label: '', mode: 'none', cents: 0 };
    var cents = s.mode === 'quote' ? null : s.byKind[prod.shippingKind];
    return { key: deliveryKey, label: s.label, mode: s.mode, cents: cents };
  }

  /*
    lines: [{ values: {...}, qty: n }]
    Devuelve el detalle por línea y los totales. Todo en céntimos enteros.
  */
  function calcOrder(productKey, lines, deliveryKey) {
    var P = pricing(), prod = P.products[productKey];
    var byVariant = {};
    if (P.tierScope === 'variant') {
      lines.forEach(function (l) {
        var k = variantKey(prod, l.values);
        byVariant[k] = (byVariant[k] || 0) + l.qty;
      });
    }
    var out = { lines: [], productsCents: 0, volume: false, shipping: shippingFor(prod, deliveryKey) };
    lines.forEach(function (l) {
      var vk = variantKey(prod, l.values);
      var variant = prod.variants[vk];
      var tierQty = P.tierScope === 'variant' ? byVariant[vk] : l.qty;
      var ti = tierIndex(tierQty);
      var unit = variant.prices[ti];
      var extra = prod.extras ? findOption(prod.extras.options, l.values.extras) : null;
      var extraUnit = extra ? extra.perUnit : 0;
      var isVolume = tierQty >= P.volumeFrom;
      var lineCents = (unit + extraUnit) * l.qty;
      out.productsCents += lineCents;
      if (isVolume) out.volume = true;
      out.lines.push({
        qty: l.qty, tier: P.tiers[ti], unitCents: unit,
        extraLabel: extra && extraUnit > 0 ? extra.label : '', extraUnitCents: extraUnit,
        lineCents: lineCents, volume: isVolume
      });
    });
    var sh = out.shipping;
    out.shippingCents = (sh.mode === 'fixed' || sh.mode === 'from') ? sh.cents : 0;
    out.shippingQuote = sh.mode === 'quote';
    out.shippingPending = sh.mode === 'none';
    out.totalCents = out.productsCents + out.shippingCents;
    return out;
  }

  /* ---------- Texto de línea ---------- */

  function optionLabelFor(field, value, forMessage) {
    var o = findOption(field.options, value);
    if (!o) return '';
    return forMessage && o.msgLabel ? o.msgLabel : o.label;
  }

  function lineDescription(prod, values) {
    var parts = [];
    var ordered = prod.lineOrder
      ? prod.lineOrder.map(function (id) { return fieldOf(prod, id); }).filter(Boolean)
      : prod.fields;
    ordered.forEach(function (f) {
      if (f.msg === false) return;
      var v = values[f.id];
      if (!v) return;
      var text = optionLabelFor(f, v, true);
      if (f.msgLower) text = text.toLowerCase();
      parts.push((f.msgPrefix || '') + text);
    });
    return parts.join(' · ');
  }

  function unitsText(qty, prod) { return qty + (qty === 1 ? ' unidad' : ' unidades'); }

  /* ---------- Validación ---------- */

  function validate(productKey, state) {
    var P = pricing(), errors = {};
    var c = state.customer || {};
    var name = oneLine(c.name, 80), phone = oneLine(c.phone, 30), email = oneLine(c.email, 120);

    if (!state.lines || !state.lines.length) errors.lines = 'Añade al menos una línea a tu pedido.';
    if (state.lines && state.lines.length > 20) errors.lines = 'Máximo 20 líneas por pedido. Para pedidos mayores, escríbenos por WhatsApp.';

    if (name.length < 2) errors.name = 'Indica tu nombre completo.';
    var digits = phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15 || !/^[+\d][\d\s().-]*$/.test(phone)) errors.phone = 'Indica un teléfono válido (mínimo 9 cifras).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Indica un email válido, por ejemplo nombre@correo.com.';

    var delivery = P.shipping[state.delivery];
    if (!delivery) errors.delivery = 'Elige cómo quieres recibir el pedido.';
    else if (delivery.needsAddress) {
      var a = state.address || {};
      if (oneLine(a.street, 140).length < 3) errors.street = 'Indica la dirección de entrega.';
      var zip = oneLine(a.zip, 10);
      if (state.delivery === 'peninsula' ? !/^\d{5}$/.test(zip) : zip.length < 3) errors.zip = state.delivery === 'peninsula' ? 'Indica un código postal de 5 cifras.' : 'Indica el código postal.';
      if (oneLine(a.city, 80).length < 2) errors.city = 'Indica la ciudad.';
      if (oneLine(a.province, 80).length < 2) errors.province = 'Indica la provincia.';
    }

    if (!findOption(P.payments, state.payment)) errors.payment = 'Elige tu forma de pago preferida.';
    return errors;
  }

  /* ---------- Mensaje de WhatsApp ---------- */

  function buildMessage(productKey, state) {
    var P = pricing(), prod = P.products[productKey];
    var calc = calcOrder(productKey, state.lines, state.delivery);
    var c = state.customer, a = state.address || {};
    var delivery = P.shipping[state.delivery];
    var pay = findOption(P.payments, state.payment);
    var L = [];

    L.push('Hola Livan Studio, quiero finalizar este pedido:', '');
    L.push('DATOS DEL CLIENTE');
    L.push('Nombre: ' + oneLine(c.name, 80));
    L.push('Teléfono: ' + oneLine(c.phone, 30));
    L.push('Email: ' + oneLine(c.email, 120), '');

    L.push('ENTREGA');
    L.push('Método: ' + delivery.label);
    if (delivery.needsAddress || oneLine(a.street, 140)) {
      if (oneLine(a.street, 140)) L.push('Dirección: ' + oneLine(a.street, 140));
      if (oneLine(a.zip, 10)) L.push('Código postal: ' + oneLine(a.zip, 10));
      if (oneLine(a.city, 80)) L.push('Ciudad: ' + oneLine(a.city, 80));
      if (oneLine(a.province, 80)) L.push('Provincia: ' + oneLine(a.province, 80));
    }
    L.push('');

    L.push('PAGO PREFERIDO');
    L.push(pay.label, '');

    L.push('PEDIDO');
    L.push('Producto: ' + prod.label, '');

    state.lines.forEach(function (line, i) {
      var r = calc.lines[i];
      L.push((i + 1) + ') ' + unitsText(r.qty, prod) + ' · ' + lineDescription(prod, line.values));
      L.push('Precio unitario: ' + money(r.unitCents));
      if (r.extraLabel) L.push('Suplemento: ' + r.extraLabel + ' · +' + money(r.extraUnitCents) + '/ud');
      L.push('Subtotal línea: ' + money(r.lineCents));
      if (r.volume) L.push('Pedido de volumen: precio final a revisar.');
      L.push('');
    });

    L.push('Subtotal productos: ' + money(calc.productsCents));
    if (calc.shippingQuote) {
      L.push('Envío estimado: a presupuestar');
      L.push('Total estimado: ' + money(calc.totalCents) + ' + envío a presupuestar');
    } else {
      L.push('Envío estimado: ' + money(calc.shippingCents));
      L.push('Total estimado: ' + money(calc.totalCents));
    }
    L.push('Precios con IVA incluido. Envío aparte.');
    if (calc.volume) L.push(P.volumeNote);
    L.push('');

    // Archivo / diseño: una frase si es igual en todas las líneas.
    var fileTexts = state.lines.map(function (line) {
      var o = findOption(prod.file.options, line.values.file);
      return o ? o.msgText : '';
    });
    var uniq = fileTexts.filter(function (t, i) { return fileTexts.indexOf(t) === i; });
    L.push('ARCHIVO / DISEÑO');
    if (uniq.length === 1) L.push(uniq[0]);
    else fileTexts.forEach(function (t, i) { L.push('Línea ' + (i + 1) + ': ' + t); });
    L.push('');

    var notes = multiLine(state.notes, 500);
    if (notes) { L.push('NOTAS', notes, ''); }

    L.push('CONFIRMACIÓN');
    L.push('Entiendo que Livan Studio revisará el archivo, disponibilidad y envío antes de producir.');
    return L.join('\n');
  }

  function whatsappUrl(message) {
    return 'https://wa.me/' + pricing().whatsappNumber + '?text=' + encodeURIComponent(message);
  }

  var core = {
    money: money, tierIndex: tierIndex, calcOrder: calcOrder, validate: validate,
    buildMessage: buildMessage, whatsappUrl: whatsappUrl, lineDescription: lineDescription
  };
  root.LivanOrder = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;

  /* ======================================================================
     Interfaz (solo en el navegador)
     ====================================================================== */
  if (typeof document === 'undefined') return;

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'for') el.htmlFor = v;
      else if (k === 'hidden') el.hidden = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (k) {
      if (k == null) return;
      el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
    return el;
  }

  function mount(host) {
    var key = host.getAttribute('data-ls-order');
    var P = pricing();
    var prod = P && P.products[key];
    if (!prod) {
      host.appendChild(h('p', { class: 'ls-note' }, ['No se pudo cargar el configurador. ',
        h('a', { href: 'https://wa.me/' + ((P && P.whatsappNumber) || '34692899784') }, ['Escríbenos por WhatsApp']), '.']));
      return;
    }

    var uid = 'ls-' + key + '-';
    var state = { lines: [], customer: {}, address: {}, delivery: '', payment: '', notes: '' };
    var nextId = 1;
    var els = {};

    /* ----- Configuración ----- */
    var configFields = h('div', { class: 'ls-config-fields' });

    function selectField(id, label, options, opts) {
      opts = opts || {};
      var sel = h('select', { id: uid + id, name: id, 'aria-describedby': uid + id + '-err' });
      if (opts.placeholder) sel.appendChild(h('option', { value: '', text: 'Elige…' }));
      options.forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
      if (!opts.placeholder) sel.value = options[0].value;
      els[id] = sel;
      return h('div', { class: 'field' }, [
        h('label', { for: uid + id, text: label }), sel,
        h('p', { class: 'ls-error', id: uid + id + '-err', hidden: true })
      ]);
    }

    prod.fields.forEach(function (f) {
      configFields.appendChild(selectField(f.id, f.label, f.options, { placeholder: f.options.length > 1 }));
    });
    if (prod.extras) configFields.appendChild(selectField('extras', prod.extras.label + ' (por unidad)', prod.extras.options.map(function (o) {
      return { value: o.value, label: o.perUnit ? o.label + ' · +' + moneyUI(o.perUnit) : o.label };
    })));
    configFields.appendChild(selectField('file', prod.file.label, prod.file.options, { placeholder: true }));

    els.qty = h('input', { id: uid + 'qty', name: 'qty', type: 'number', inputmode: 'numeric', min: '1', max: String(P.maxQuantity), step: '1', value: '1', 'aria-describedby': uid + 'qty-err' });
    configFields.appendChild(h('div', { class: 'field' }, [
      h('label', { for: uid + 'qty', text: 'Cantidad' }), els.qty,
      h('p', { class: 'ls-error', id: uid + 'qty-err', hidden: true })
    ]));

    els.pricePanel = h('div', { class: 'ls-price', role: 'status', 'aria-live': 'polite' });
    els.tiers = h('ul', { class: 'ls-tiers', 'aria-label': 'Precio por cantidad' });
    els.addBtn = h('button', { class: 'btn btn-primary ls-add', type: 'button', text: 'Añadir línea' });
    els.configMsg = h('p', { class: 'ls-note', role: 'status', 'aria-live': 'polite' });

    var configCard = h('section', { class: 'ls-card ls-config', 'aria-labelledby': uid + 'h1' }, [
      h('h3', { id: uid + 'h1', text: '1. Elige tu configuración' }),
      configFields, els.pricePanel, els.tiers,
      h('div', { class: 'ls-actions' }, [els.addBtn]), els.configMsg
    ]);

    /* ----- Líneas ----- */
    els.linesHeading = h('h3', { id: uid + 'h2', tabindex: '-1', text: '2. Tu pedido' });
    els.linesList = h('ul', { class: 'ls-lines' });
    els.linesEmpty = h('p', { class: 'ls-note', text: 'Todavía no has añadido ninguna línea.' });
    els.linesSubtotal = h('p', { class: 'ls-lines-subtotal', hidden: true });
    els.linesError = h('p', { class: 'ls-error', id: uid + 'lines-err', hidden: true });
    var linesCard = h('section', { class: 'ls-card ls-summary', 'aria-labelledby': uid + 'h2' }, [
      els.linesHeading, els.linesEmpty, els.linesList, els.linesSubtotal, els.linesError
    ]);

    /* ----- Datos del cliente ----- */
    function textField(id, label, attrs, hint) {
      var input = h('input', Object.assign({ id: uid + id, name: id, 'aria-describedby': uid + id + '-err' }, attrs));
      els[id] = input;
      return h('div', { class: 'field' }, [
        h('label', { for: uid + id, text: label }), input,
        hint ? h('small', { text: hint }) : null,
        h('p', { class: 'ls-error', id: uid + id + '-err', hidden: true })
      ]);
    }
    els.notes = h('textarea', { id: uid + 'notes', name: 'notes', rows: '3', maxlength: '500', autocomplete: 'off' });
    var customerCard = h('section', { class: 'ls-card', 'aria-labelledby': uid + 'h3' }, [
      h('h3', { id: uid + 'h3', text: '3. Tus datos' }),
      h('div', { class: 'ls-config-fields' }, [
        textField('name', 'Nombre completo', { type: 'text', autocomplete: 'name', maxlength: '80' }),
        textField('phone', 'Teléfono', { type: 'tel', autocomplete: 'tel', maxlength: '30', inputmode: 'tel' }),
        textField('email', 'Email', { type: 'email', autocomplete: 'email', maxlength: '120' }),
        h('div', { class: 'field field-full' }, [
          h('label', { for: uid + 'notes', text: 'Comentarios (opcional)' }), els.notes,
          h('small', { text: 'Por ejemplo, el texto de la taza o el nombre y dorsal de cada camiseta.' })
        ])
      ])
    ]);

    /* ----- Entrega ----- */
    function radioGroup(name, legend, items, errId) {
      var fs = h('fieldset', { class: 'ls-choices', 'aria-describedby': errId });
      fs.appendChild(h('legend', { text: legend }));
      items.forEach(function (it) {
        var input = h('input', { type: 'radio', name: uid + name, value: it.value });
        fs.appendChild(h('label', { class: 'ls-choice' }, [input, h('span', { text: it.label })]));
      });
      return fs;
    }
    var deliveryItems = Object.keys(P.shipping).map(function (k) {
      var s = P.shipping[k], extra = '';
      if (s.mode === 'from') extra = ' · desde ' + moneyUI(s.byKind[prod.shippingKind]);
      else if (s.mode === 'fixed') extra = ' · ' + moneyUI(s.byKind[prod.shippingKind]);
      else extra = ' · a presupuestar';
      return { value: k, label: s.label + extra };
    });
    els.deliveryGroup = radioGroup('delivery', 'Cómo quieres recibirlo', deliveryItems, uid + 'delivery-err');
    els.deliveryErr = h('p', { class: 'ls-error', id: uid + 'delivery-err', hidden: true });
    els.addressBlock = h('div', { class: 'ls-config-fields ls-address', hidden: true }, [
      textField('street', 'Dirección', { type: 'text', autocomplete: 'street-address', maxlength: '140' }),
      textField('zip', 'Código postal', { type: 'text', autocomplete: 'postal-code', maxlength: '10', inputmode: 'numeric' }),
      textField('city', 'Ciudad', { type: 'text', autocomplete: 'address-level2', maxlength: '80' }),
      textField('province', 'Provincia', { type: 'text', autocomplete: 'address-level1', maxlength: '80' })
    ]);
    var deliveryCard = h('section', { class: 'ls-card', 'aria-labelledby': uid + 'h4' }, [
      h('h3', { id: uid + 'h4', text: '4. Entrega' }), els.deliveryGroup, els.deliveryErr, els.addressBlock,
      h('p', { class: 'ls-note', text: 'Envío aparte. Los envíos a Baleares, Canarias, Ceuta y Melilla se presupuestan.' })
    ]);

    /* ----- Pago ----- */
    els.paymentGroup = radioGroup('payment', 'Forma de pago preferida', P.payments, uid + 'payment-err');
    els.paymentErr = h('p', { class: 'ls-error', id: uid + 'payment-err', hidden: true });
    var paymentCard = h('section', { class: 'ls-card', 'aria-labelledby': uid + 'h5' }, [
      h('h3', { id: uid + 'h5', text: '5. Pago preferido' }), els.paymentGroup, els.paymentErr,
      h('p', { class: 'ls-note', text: 'No se paga nada en la web. Te indicaremos cómo pagar por WhatsApp una vez revisado el pedido.' })
    ]);

    /* ----- Total y envío por WhatsApp ----- */
    els.totals = h('dl', { class: 'ls-totals', role: 'status', 'aria-live': 'polite' });
    els.volumeNote = h('p', { class: 'ls-volume', hidden: true, text: P.volumeNote });
    els.errorBox = h('div', { class: 'ls-errorbox', role: 'alert', tabindex: '-1', hidden: true });
    els.sendBtn = h('button', { class: 'btn btn-primary ls-send', type: 'submit', text: 'Finalizar por WhatsApp' });
    els.sent = h('div', { class: 'ls-sent', role: 'status', hidden: true });
    var totalCard = h('section', { class: 'ls-card ls-total-card', 'aria-labelledby': uid + 'h6' }, [
      h('h3', { id: uid + 'h6', text: '6. Total estimado' }),
      els.totals, els.volumeNote,
      h('p', { class: 'ls-price-note', text: P.priceNote }),
      h('p', { class: 'ls-note', text: P.reviewNote }),
      els.errorBox, els.sendBtn, els.sent,
      h('p', { class: 'ls-note ls-privacy' }, ['Al finalizar se abrirá WhatsApp con tu pedido; no se envía nada hasta que tú lo envíes. Tus datos no se guardan en esta web. ',
        h('a', { href: '/politica-privacidad.html', text: 'Política de privacidad' }), '.'])
    ]);

    els.form = h('form', { class: 'ls-form', novalidate: true, autocomplete: 'on' }, [customerCard, deliveryCard, paymentCard, totalCard]);
    els.live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });

    host.textContent = '';
    host.appendChild(h('div', { class: 'ls-order-grid' }, [
      h('div', { class: 'ls-col' }, [configCard, linesCard]),
      h('div', { class: 'ls-col' }, [els.form])
    ]));
    host.appendChild(els.live);

    /* ----- Lectura de estado ----- */
    function readConfig() {
      var values = {};
      prod.fields.forEach(function (f) { values[f.id] = els[f.id].value; });
      if (prod.extras) values.extras = els.extras.value;
      values.file = els.file.value;
      var raw = String(els.qty.value).trim();
      var qty = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
      return { values: values, qty: qty };
    }

    function setError(el, errEl, msg) {
      if (msg) {
        errEl.textContent = msg; errEl.hidden = false; el.setAttribute('aria-invalid', 'true');
      } else {
        errEl.textContent = ''; errEl.hidden = true; el.removeAttribute('aria-invalid');
      }
    }
    function errElFor(id) { return document.getElementById(uid + id + '-err'); }

    function announce(msg) { els.live.textContent = ''; setTimeout(function () { els.live.textContent = msg; }, 30); }

    /* ----- Vista previa de precio ----- */
    function renderPrice() {
      var cfg = readConfig();
      var vk = cfg.values[prod.variantField];
      var variant = vk && prod.variants[vk];
      els.pricePanel.textContent = '';
      els.tiers.textContent = '';
      if (!variant) {
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Elige la configuración para ver el precio.' }));
        return;
      }
      var qtyOk = isFinite(cfg.qty) && cfg.qty >= 1 && cfg.qty <= P.maxQuantity;
      var r = null;
      if (qtyOk) {
        var temp = previewLines(cfg);
        r = calcOrder(key, temp.lines, "").lines[temp.index];
      }
      variant.prices.forEach(function (p, i) {
        els.tiers.appendChild(h('li', { class: r && P.tiers[i] === r.tier ? 'is-current' : '' }, [
          h('span', { text: P.tiers[i] + (i === P.tiers.length - 1 ? '+ uds' : ' ud' + (P.tiers[i] === 1 ? '' : 's')) }),
          h('strong', { text: moneyUI(p) })
        ]));
      });
      if (!qtyOk) {
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Indica una cantidad válida para ver el precio de la línea.' }));
        return;
      }
      els.pricePanel.appendChild(h('p', { class: 'ls-price-main' }, [
        h('span', { text: 'Precio unitario' }), h('strong', { text: moneyUI(r.unitCents) })
      ]));
      if (r.extraLabel) els.pricePanel.appendChild(h('p', { class: 'ls-price-sub', text: 'Suplemento: +' + moneyUI(r.extraUnitCents) + ' por unidad' }));
      els.pricePanel.appendChild(h('p', { class: 'ls-price-sub' }, ['Subtotal de esta línea: ', h('strong', { text: moneyUI(r.lineCents) })]));
      if (r.volume) els.pricePanel.appendChild(h('p', { class: 'ls-volume', text: P.volumeNote }));
    }
    // Líneas del pedido + la que se está configurando (fusionando si ya existe igual).
    function previewLines(cfg) {
      var lines = state.lines.map(function (l) { return { values: l.values, qty: l.qty }; });
      var same = findSame(cfg.values);
      if (same) { var i = state.lines.indexOf(same); lines[i].qty = Math.min(same.qty + cfg.qty, P.maxQuantity); return { lines: lines, index: i }; }
      lines.push({ values: cfg.values, qty: cfg.qty });
      return { lines: lines, index: lines.length - 1 };
    }

    /* ----- Líneas ----- */
    function renderLines() {
      els.linesList.textContent = '';
      var has = state.lines.length > 0;
      els.linesEmpty.hidden = has;
      els.linesSubtotal.hidden = !has;
      var calc = has ? calcOrder(key, state.lines, state.delivery) : null;
      state.lines.forEach(function (line, i) {
        var r = calc.lines[i];
        var desc = unitsText(r.qty, prod) + ' · ' + lineDescription(prod, line.values);
        var fileOpt = findOption(prod.file.options, line.values.file);
        var li = h('li', { class: 'ls-line' }, [
          h('div', { class: 'ls-line-main' }, [
            h('p', { class: 'ls-line-title', text: (i + 1) + ') ' + desc }),
            h('p', { class: 'ls-line-meta', text: 'Precio unitario ' + moneyUI(r.unitCents) + (r.extraLabel ? ' · ' + r.extraLabel + ' +' + moneyUI(r.extraUnitCents) + '/ud' : '') + (fileOpt ? ' · ' + fileOpt.label : '') }),
            r.volume ? h('p', { class: 'ls-volume', text: 'Pedido de volumen: precio final a revisar.' }) : null
          ]),
          h('div', { class: 'ls-line-side' }, [
            h('strong', { class: 'ls-line-total', text: moneyUI(r.lineCents) }),
            h('button', { class: 'ls-remove', type: 'button', 'data-id': String(line.id), 'aria-label': 'Quitar línea ' + (i + 1) + ': ' + desc, text: 'Quitar' })
          ])
        ]);
        els.linesList.appendChild(li);
      });
      if (has) els.linesSubtotal.textContent = 'Subtotal productos: ' + moneyUI(calc.productsCents);
      if (has) setLinesError('');
    }
    function setLinesError(msg) {
      els.linesError.textContent = msg; els.linesError.hidden = !msg;
    }

    /* ----- Totales ----- */
    function renderTotals() {
      var calc = calcOrder(key, state.lines, state.delivery);
      els.totals.textContent = '';
      function row(label, value, cls) {
        els.totals.appendChild(h('div', { class: 'ls-total-row ' + (cls || '') }, [h('dt', { text: label }), h('dd', { text: value })]));
      }
      var has = state.lines.length > 0;
      row('Subtotal productos', has ? moneyUI(calc.productsCents) : '—');
      var ship;
      if (calc.shippingPending) ship = 'Elige entrega';
      else if (calc.shippingQuote) ship = 'A presupuestar';
      else if (calc.shipping.mode === 'from') ship = 'desde ' + moneyUI(calc.shippingCents);
      else ship = moneyUI(calc.shippingCents);
      row('Envío estimado', ship);
      var totalText = has ? moneyUI(calc.totalCents) + (calc.shippingQuote ? ' + envío' : '') : '—';
      row('Total estimado', totalText, 'is-total');
      els.volumeNote.hidden = !calc.volume;
      return calc;
    }

    function renderAll() { renderLines(); renderTotals(); }

    /* ----- Eventos: configuración ----- */
    function clearConfigErrors() {
      prod.fields.concat([{ id: 'file' }]).forEach(function (f) { setError(els[f.id], errElFor(f.id), ''); });
      setError(els.qty, errElFor('qty'), '');
    }

    function addLine() {
      clearConfigErrors();
      els.configMsg.textContent = '';
      var cfg = readConfig();
      var first = null, bad = false;
      prod.fields.concat([{ id: 'file', label: prod.file.label }]).forEach(function (f) {
        if (!cfg.values[f.id]) {
          setError(els[f.id], errElFor(f.id), 'Elige una opción en «' + f.label + '».');
          if (!first) first = els[f.id];
          bad = true;
        }
      });
      if (!isFinite(cfg.qty) || cfg.qty < 1) {
        setError(els.qty, errElFor('qty'), 'Indica una cantidad entera de 1 o más.');
        if (!first) first = els.qty; bad = true;
      } else if (cfg.qty > P.maxQuantity) {
        setError(els.qty, errElFor('qty'), 'Para más de ' + P.maxQuantity + ' unidades escríbenos y lo valoramos.');
        if (!first) first = els.qty; bad = true;
      }
      if (bad) { first.focus(); return; }
      if (state.lines.length >= 20 && !findSame(cfg.values)) {
        els.configMsg.textContent = 'Máximo 20 líneas por pedido. Para pedidos mayores, escríbenos por WhatsApp.';
        return;
      }
      var same = findSame(cfg.values);
      var idx;
      if (same) {
        same.qty += cfg.qty;
        if (same.qty > P.maxQuantity) same.qty = P.maxQuantity;
        idx = state.lines.indexOf(same) + 1;
        els.configMsg.textContent = 'Cantidad sumada a la línea ' + idx + '.';
      } else {
        state.lines.push({ id: nextId++, values: cfg.values, qty: cfg.qty });
        idx = state.lines.length;
        els.configMsg.textContent = 'Línea ' + idx + ' añadida a tu pedido.';
      }
      announce(els.configMsg.textContent);
      renderAll(); renderPrice();
    }
    function findSame(values) {
      for (var i = 0; i < state.lines.length; i++) {
        var l = state.lines[i], same = true;
        Object.keys(values).forEach(function (k) { if (l.values[k] !== values[k]) same = false; });
        if (same) return l;
      }
      return null;
    }

    els.addBtn.addEventListener('click', addLine);
    els.qty.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addLine(); } });
    configCard.addEventListener('input', renderPrice);
    configCard.addEventListener('change', function (e) {
      renderPrice();
      var t = e.target;
      if (t && t.id && els[t.name] === t) setError(t, errElFor(t.name), '');
    });

    els.linesList.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.ls-remove') : null;
      if (!btn) return;
      var id = parseInt(btn.getAttribute('data-id'), 10);
      state.lines = state.lines.filter(function (l) { return l.id !== id; });
      renderAll(); renderPrice();
      announce('Línea quitada. ' + (state.lines.length ? 'Quedan ' + state.lines.length + '.' : 'Tu pedido está vacío.'));
      els.linesHeading.focus();
    });

    /* ----- Eventos: formulario ----- */
    function syncDelivery() {
      var checked = els.form.querySelector('input[name="' + uid + 'delivery"]:checked');
      state.delivery = checked ? checked.value : '';
      var d = P.shipping[state.delivery];
      var showAddr = !!d && (d.needsAddress || state.delivery === 'consultar');
      els.addressBlock.hidden = !showAddr;
      setError(els.deliveryGroup, els.deliveryErr, '');
      renderAll();
    }
    els.deliveryGroup.addEventListener('change', syncDelivery);
    els.paymentGroup.addEventListener('change', function () {
      var c = els.form.querySelector('input[name="' + uid + 'payment"]:checked');
      state.payment = c ? c.value : '';
      setError(els.paymentGroup, els.paymentErr, '');
    });
    ['name', 'phone', 'email', 'street', 'zip', 'city', 'province'].forEach(function (id) {
      els[id].addEventListener('input', function () { if (els[id].getAttribute('aria-invalid')) setError(els[id], errElFor(id), ''); });
    });

    function readState() {
      state.customer = { name: els.name.value, phone: els.phone.value, email: els.email.value };
      state.address = { street: els.street.value, zip: els.zip.value, city: els.city.value, province: els.province.value };
      state.notes = els.notes.value;
    }

    function showErrors(errors) {
      var order = ['lines', 'name', 'phone', 'email', 'delivery', 'street', 'zip', 'city', 'province', 'payment'];
      var msgs = [], firstFocus = null;
      setLinesError(errors.lines || '');
      ['name', 'phone', 'email', 'street', 'zip', 'city', 'province'].forEach(function (id) { setError(els[id], errElFor(id), errors[id] || ''); });
      setError(els.deliveryGroup, els.deliveryErr, errors.delivery || '');
      setError(els.paymentGroup, els.paymentErr, errors.payment || '');
      order.forEach(function (id) {
        if (!errors[id]) return;
        msgs.push(errors[id]);
        if (!firstFocus) {
          if (id === 'lines') firstFocus = els.addBtn;
          else if (id === 'delivery') firstFocus = els.form.querySelector('input[name="' + uid + 'delivery"]');
          else if (id === 'payment') firstFocus = els.form.querySelector('input[name="' + uid + 'payment"]');
          else firstFocus = els[id];
        }
      });
      els.errorBox.textContent = '';
      els.errorBox.appendChild(h('p', { text: 'Revisa estos puntos antes de finalizar:' }));
      var ul = h('ul');
      msgs.forEach(function (m) { ul.appendChild(h('li', { text: m })); });
      els.errorBox.appendChild(ul);
      els.errorBox.hidden = false;
      if (firstFocus) firstFocus.focus();
    }

    els.form.addEventListener('submit', function (e) {
      e.preventDefault();
      els.sent.hidden = true;
      readState();
      var errors = validate(key, state);
      if (Object.keys(errors).length) { showErrors(errors); return; }
      els.errorBox.hidden = true;
      var message = buildMessage(key, state);
      if (message.length > 3800) {
        showErrors({ lines: 'El pedido es demasiado largo para enviarlo en un solo mensaje. Reduce líneas o escríbenos directamente.' });
        return;
      }
      var url = whatsappUrl(message);
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'whatsapp_click', product: prod.label, source: 'order_builder', page_path: location.pathname });
      var a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      els.sent.textContent = '';
      els.sent.appendChild(h('p', { text: 'Hemos abierto WhatsApp con tu pedido preparado. No se envía nada hasta que pulses enviar en WhatsApp.' }));
      els.sent.appendChild(h('p', {}, ['¿No se ha abierto? ', h('a', { href: url, target: '_blank', rel: 'noopener', text: 'Abrir WhatsApp con mi pedido' }), '.']));
      els.sent.hidden = false;
    });

    renderPrice();
    renderAll();
  }

  function init() {
    if (!pricing()) return;
    var hosts = document.querySelectorAll('[data-ls-order]');
    for (var i = 0; i < hosts.length; i++) mount(hosts[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
