/*
  Livan Studio · Prepara tu pedido (MVP 1: camisetas y tazas · MVP 2: pedido general)
  ------------------------------------------------------------------
  - Calcula precios con la tarifa de /assets/data/pricing.js (en céntimos).
  - Dos modos: data-ls-order="camisetas" (un producto, páginas de producto) y
    data-ls-order="general" (varios productos, /pedidos.html).
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
  function isGeneral(key) { return !key || key === 'general'; }

  /* ---------- Catálogo y estados de precio ---------- */

  // Tramo más cercano hacia abajo: 1-4 -> 0, 5-9 -> 1, 10-24 -> 2 ...
  function tierIndex(qty) {
    var tiers = pricing().tiers, idx = 0;
    for (var i = 0; i < tiers.length; i++) if (qty >= tiers[i]) idx = i;
    return idx;
  }

  // Clave de variante de precio: un campo (variantField), varios (variantFields, p. ej. tipo + posición) o ninguno.
  function variantKeyOf(prod, values) {
    if (prod.variantFields) return prod.variantFields.map(function (f) { return values[f] || ''; }).join('|');
    return prod.variantField ? (values[prod.variantField] || '') : 'default';
  }
  function variantOf(prod, values) { return prod.variants ? (prod.variants[variantKeyOf(prod, values)] || null) : null; }
  function hasPrices(variant) {
    return !!(variant && variant.prices && variant.prices.length === pricing().tiers.length);
  }

  // Estado de una línea: una variante sin tarifa pasa a "a presupuesto".
  function lineStatus(prod, variant) {
    if (prod.status === 'quote_required') return 'quote_required';
    return hasPrices(variant) ? prod.status : 'quote_required';
  }
  // Estado efectivo del producto (para agruparlo en el selector).
  function productStatus(prod) {
    if (prod.status === 'quote_required' || !prod.variants) return 'quote_required';
    for (var k in prod.variants) if (hasPrices(prod.variants[k])) return prod.status;
    return 'quote_required';
  }

  // Ordena las líneas por producto, en el orden del catálogo (estable dentro de cada producto).
  function orderLines(lines) {
    var out = [];
    Object.keys(pricing().products).forEach(function (pk) {
      lines.forEach(function (l) { if (l.product === pk) out.push(l); });
    });
    return out;
  }

  // Pedido mixto textil + frágil: se aplica el envío más alto de los tipos presentes.
  function shippingForOrder(kinds, deliveryKey) {
    var P = pricing(), s = P.shipping[deliveryKey];
    if (!s) return { key: '', label: '', mode: 'none', cents: 0 };
    if (s.mode === 'quote') return { key: deliveryKey, label: s.label, mode: s.mode, cents: null };
    var max = 0, any = false;
    kinds.forEach(function (k) { any = true; if (s.byKind[k] > max) max = s.byKind[k]; });
    if (!any) max = s.byKind.textil;
    return { key: deliveryKey, label: s.label, mode: s.mode, cents: max };
  }

  /* ---------- Cálculo ---------- */

  /*
    lines: [{ product, values: {...}, qty: n }]
    Tramos por producto + variante de precio (tierScope 'variant'): no se
    mezclan productos ni variantes distintas. Todo en céntimos enteros.
  */
  function calcMixed(lines, deliveryKey) {
    var P = pricing();
    var meta = lines.map(function (l) {
      var prod = P.products[l.product];
      var variant = variantOf(prod, l.values);
      return { prod: prod, variant: variant, status: lineStatus(prod, variant), tk: l.product + '|' + variantKeyOf(prod, l.values) };
    });
    var agg = {};
    if (P.tierScope === 'variant') {
      lines.forEach(function (l, i) {
        if (meta[i].status === 'quote_required') return;
        agg[meta[i].tk] = (agg[meta[i].tk] || 0) + l.qty;
      });
    }
    var out = {
      lines: [], productsCents: 0, estimatedCents: 0, volume: false,
      pricedCount: 0, quoteCount: 0, hasEstimated: false, hasQuote: false, shippingReview: false
    };
    var kinds = [];
    var fixedCharged = {};
    lines.forEach(function (l, i) {
      var m = meta[i], prod = m.prod;
      var kind = prod.shippingKind || 'textil';
      if (kinds.indexOf(kind) < 0) kinds.push(kind);
      if (m.status === 'quote_required') {
        out.hasQuote = true; out.quoteCount++;
        out.lines.push({
          product: l.product, status: m.status, priced: false, estimated: false, qty: l.qty, tier: null,
          unitCents: null, lineCents: null, extraLabel: '', extraUnitCents: 0, volume: false
        });
        return;
      }
      var tierQty = P.tierScope === 'variant' ? agg[m.tk] : l.qty;
      var ti = tierIndex(tierQty);
      var unit = m.variant.prices[ti];
      if (unit == null) {
        // Tramo sin precio (p. ej. 100+ unidades): la línea se presupuesta.
        out.hasQuote = true; out.quoteCount++;
        out.lines.push({
          product: l.product, status: 'quote_required', priced: false, estimated: false, volumeQuote: true, qty: l.qty,
          tier: P.tiers[ti], unitCents: null, lineCents: null, extraLabel: '', extraUnitCents: 0, volume: true
        });
        return;
      }
      var extra = prod.extras ? findOption(prod.extras.options, l.values.extras) : null;
      var extraUnit = extra ? extra.perUnit : 0;
      var extraFixed = 0;
      if (extra && extra.fixed) {
        // Pago único (p. ej. digitalización del logo): una sola vez por producto y opción.
        var fk = l.product + '|' + extra.value;
        if (!fixedCharged[fk]) { fixedCharged[fk] = true; extraFixed = extra.fixed; }
      }
      var isVolume = tierQty >= P.volumeFrom;
      var lineCents = (unit + extraUnit) * l.qty + extraFixed;
      var estimated = m.status === 'estimated';
      out.productsCents += lineCents;
      out.pricedCount++;
      if (estimated) { out.hasEstimated = true; out.estimatedCents += lineCents; }
      if (isVolume) out.volume = true;
      out.lines.push({
        product: l.product, status: m.status, priced: true, estimated: estimated, qty: l.qty,
        tier: P.tiers[ti], unitCents: unit,
        extraLabel: extra && (extraUnit > 0 || extraFixed > 0) ? extra.label : '', extraUnitCents: extraUnit, extraFixedCents: extraFixed,
        lineCents: lineCents, volume: isVolume
      });
    });
    out.shipping = shippingForOrder(kinds, deliveryKey);
    var sh = out.shipping;
    out.shippingCents = (sh.mode === 'fixed' || sh.mode === 'from') ? sh.cents : 0;
    out.shippingQuote = sh.mode === 'quote';
    out.shippingPending = sh.mode === 'none';
    // Si no hay ninguna línea con precio, el envío a domicilio no se puede estimar.
    if (sh.mode === 'from' && lines.length && out.pricedCount === 0) { out.shippingQuote = true; out.shippingCents = 0; }
    out.shippingReview = out.hasQuote;
    // Gorras bordadas: varios logos o textos distintos (campo `detail`) => revisión manual.
    var logos = {};
    lines.forEach(function (l, i) {
      if (!meta[i].prod.multiLogoReview || meta[i].status === 'quote_required') return;
      var d = oneLine(l.values.detail, 300).toLowerCase();
      if (d) (logos[l.product] = logos[l.product] || {})[d] = true;
    });
    out.multiLogo = Object.keys(logos).some(function (k) { return Object.keys(logos[k]).length > 1; });
    out.totalCents = out.productsCents + out.shippingCents;
    return out;
  }

  // Un solo producto (páginas de camisetas y tazas).
  function calcOrder(productKey, lines, deliveryKey) {
    return calcMixed(lines.map(function (l) { return { product: productKey, values: l.values, qty: l.qty }; }), deliveryKey);
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

  // "+3,50 €/ud", "+6,90 €/ud + 30,00 € (pago único)"
  function extraPriceText(perUnit, fixed) {
    var t = perUnit > 0 ? '+' + money(perUnit) + '/ud' : '';
    if (fixed > 0) t += (t ? ' + ' : '+') + money(fixed) + ' (pago único)';
    return t;
  }

  function unitsText(qty) { return qty + (qty === 1 ? ' unidad' : ' unidades'); }

  /* ---------- Validación ---------- */

  function validate(productKey, state) {
    var P = pricing(), errors = {};
    var c = state.customer || {};
    var name = oneLine(c.name, 80), phone = oneLine(c.phone, 30), email = oneLine(c.email, 120);

    if (!state.lines || !state.lines.length) errors.lines = isGeneral(productKey) ? 'Añade al menos un producto a tu pedido.' : 'Añade al menos una línea a tu pedido.';
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

  // Texto del total, compartido por el mensaje (la interfaz usa una versión más corta).
  function totalMessageText(calc) {
    if (calc.pricedCount === 0) return 'a presupuestar';
    var t = money(calc.totalCents);
    if (calc.shippingQuote && calc.hasQuote) t += ' + envío y productos a presupuestar';
    else if (calc.shippingQuote) t += ' + envío a presupuestar';
    else if (calc.hasQuote) t += ' + productos a presupuestar';
    return t;
  }

  function buildMessage(productKey, state) {
    var P = pricing(), general = isGeneral(productKey);
    var raw = state.lines.map(function (l) { return { product: l.product || productKey, values: l.values, qty: l.qty }; });
    var lines = general ? orderLines(raw) : raw;
    var calc = calcMixed(lines, state.delivery);
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
    if (state.urgent) L.push('URGENTE: necesito el pedido con urgencia; plazo y posible suplemento a presupuestar.');
    if (!general) L.push('Producto: ' + P.products[lines[0].product].label);
    L.push('');

    var lastProduct = null;
    lines.forEach(function (line, i) {
      var prod = P.products[line.product], r = calc.lines[i];
      if (general && line.product !== lastProduct) { L.push(prod.label.toUpperCase()); lastProduct = line.product; }
      var desc = lineDescription(prod, line.values);
      L.push((i + 1) + ') ' + unitsText(r.qty) + (desc ? ' · ' + desc : ''));
      if (r.status === 'quote_required') {
        L.push('Precio: a presupuestar');
        if (r.volumeQuote) L.push('Pedido de volumen: precio a presupuestar.');
      } else {
        L.push((r.estimated ? 'Precio unitario orientativo: ' : 'Precio unitario: ') + money(r.unitCents));
        if (r.extraLabel) L.push('Suplemento: ' + r.extraLabel + ' · ' + extraPriceText(r.extraUnitCents, r.extraFixedCents));
        L.push((r.estimated ? 'Subtotal línea orientativo: ' : 'Subtotal línea: ') + money(r.lineCents));
        if (r.volume) L.push('Pedido de volumen: precio final a revisar.');
      }
      var detail = oneLine(line.values.detail, 300);
      if (detail) L.push('Detalle: ' + detail);
      L.push('');
    });

    L.push('Subtotal productos: ' + (calc.pricedCount === 0 ? 'a presupuestar' : money(calc.productsCents)));
    L.push('Envío estimado: ' + (calc.shippingQuote ? 'a presupuestar' : money(calc.shippingCents)));
    L.push('Total estimado: ' + totalMessageText(calc));
    L.push('Precios con IVA incluido. Envío aparte.');
    if (calc.hasEstimated) {
      L.push('Incluye precios orientativos. Te confirmaremos el importe final tras revisar producto, archivo, cantidad y disponibilidad.');
      var noted = [];
      lines.forEach(function (line, i) {
        var pr = P.products[line.product];
        if (calc.lines[i].estimated && pr.estimateNote && noted.indexOf(line.product) < 0) {
          noted.push(line.product);
          L.push(pr.label + ': ' + pr.estimateNote);
        }
      });
    }
    if (calc.multiLogo) L.push(P.multiLogoNote);
    if (calc.hasQuote) L.push('Líneas a presupuestar: ' + calc.quoteCount + ' (sin precio en el total).');
    if (calc.shippingReview) L.push('El envío se revisará según el pedido final.');
    if (calc.volume) L.push(P.volumeNote);
    L.push('');

    // Archivo / diseño: una frase si es igual en todas las líneas.
    var fileTexts = lines.map(function (line) {
      var o = findOption(P.products[line.product].file.options, line.values.file);
      return o ? o.msgText : '';
    });
    var uniq = fileTexts.filter(function (t, i) { return fileTexts.indexOf(t) === i; });
    L.push('ARCHIVO / DISEÑO');
    if (uniq.length === 1) L.push(uniq[0]);
    else if (general) {
      // Pedido general: se agrupan las líneas con el mismo estado de archivo.
      uniq.forEach(function (t) {
        var nums = [];
        fileTexts.forEach(function (x, i) { if (x === t) nums.push(i + 1); });
        var label = nums.length === 1 ? 'Línea ' + nums[0]
          : 'Líneas ' + nums.slice(0, -1).join(', ') + ' y ' + nums[nums.length - 1];
        L.push(label + ': ' + t);
      });
    } else fileTexts.forEach(function (t, i) { L.push('Línea ' + (i + 1) + ': ' + t); });
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
    money: money, tierIndex: tierIndex, calcOrder: calcOrder, calcMixed: calcMixed, validate: validate,
    buildMessage: buildMessage, whatsappUrl: whatsappUrl, lineDescription: lineDescription,
    productStatus: productStatus, orderLines: orderLines, variantKeyOf: variantKeyOf
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
    var general = isGeneral(key);
    if (!P || (!general && !P.products[key])) {
      host.appendChild(h('p', { class: 'ls-note' }, ['No se pudo cargar el configurador. ',
        h('a', { href: 'https://wa.me/' + ((P && P.whatsappNumber) || '34692899784') }, ['Escríbenos por WhatsApp']), '.']));
      return;
    }

    var uid = 'ls-' + key + '-';
    var state = { lines: [], customer: {}, address: {}, delivery: '', payment: '', notes: '', urgent: false };
    var nextId = 1;
    var els = {};
    var cur = { key: general ? '' : key, ctl: {} };   // producto en configuración y sus controles
    function curProd() { return cur.key ? P.products[cur.key] : null; }

    /* ----- Configuración ----- */
    var configFields = h('div', { class: 'ls-config-fields' });

    function errP(id) { return h('p', { class: 'ls-error', id: uid + id + '-err', hidden: true }); }

    function selectField(id, label, options, opts) {
      opts = opts || {};
      var sel = h('select', { id: uid + id, name: id, 'aria-describedby': uid + id + '-err' });
      if (opts.placeholder) sel.appendChild(h('option', { value: '', text: 'Elige…' }));
      options.forEach(function (o) { sel.appendChild(h('option', { value: o.value, text: o.label })); });
      if (!opts.placeholder) sel.value = options[0].value;
      cur.ctl[id] = sel;
      return h('div', { class: 'field' }, [h('label', { for: uid + id, text: label }), sel, errP(id)]);
    }

    function buildFields() {
      configFields.textContent = '';
      cur.ctl = {};
      var prod = curProd();
      if (!prod) return;
      prod.fields.forEach(function (f) {
        configFields.appendChild(selectField(f.id, f.label, f.options, { placeholder: f.options.length > 1 }));
      });
      if (prod.extras) {
        // Si hay suplementos de pago único, el precio por unidad se marca con "/ud".
        var hasFixed = prod.extras.options.some(function (o) { return o.fixed; });
        configFields.appendChild(selectField('extras', prod.extras.label + (hasFixed ? '' : ' (por unidad)'), prod.extras.options.map(function (o) {
          var t = o.label;
          if (o.perUnit) t += ' · +' + moneyUI(o.perUnit) + (hasFixed ? '/ud' : '');
          if (o.fixed) t += ' + ' + moneyUI(o.fixed) + ' (pago único)';
          return { value: o.value, label: t };
        }), { placeholder: !!prod.extras.required }));
      }
      if (prod.detail) {
        var ta = h('textarea', { id: uid + 'detail', name: 'detail', rows: '3', maxlength: '300', placeholder: prod.detail.placeholder || '', autocomplete: 'off', 'aria-describedby': uid + 'detail-err' });
        cur.ctl.detail = ta;
        configFields.appendChild(h('div', { class: 'field field-full' }, [h('label', { for: uid + 'detail', text: prod.detail.label + ' (opcional)' }), ta, errP('detail')]));
      }
      configFields.appendChild(selectField('file', prod.file.label, prod.file.options, { placeholder: true }));
      var qtyLabel = productStatus(prod) === 'quote_required' ? 'Cantidad aproximada' : 'Cantidad';
      cur.ctl.qty = h('input', { id: uid + 'qty', name: 'qty', type: 'number', inputmode: 'numeric', min: '1', max: String(P.maxQuantity), step: '1', value: '1', 'aria-describedby': uid + 'qty-err' });
      configFields.appendChild(h('div', { class: 'field' }, [h('label', { for: uid + 'qty', text: qtyLabel }), cur.ctl.qty, errP('qty')]));
    }

    // Selector de producto (solo modo general), agrupado por estado de precio.
    var productField = null;
    if (general) {
      els.productSel = h('select', { id: uid + 'product', name: 'product', 'aria-describedby': uid + 'product-err' });
      els.productSel.appendChild(h('option', { value: '', text: 'Elige un producto…' }));
      ['fixed_provisional', 'estimated', 'quote_required'].forEach(function (st) {
        var grp = h('optgroup', { label: P.statusLabels[st] });
        Object.keys(P.products).forEach(function (pk) {
          if (productStatus(P.products[pk]) === st) grp.appendChild(h('option', { value: pk, text: P.products[pk].label }));
        });
        if (grp.children.length) els.productSel.appendChild(grp);
      });
      productField = h('div', { class: 'field field-full ls-product-field' }, [
        h('label', { for: uid + 'product', text: 'Producto' }), els.productSel, errP('product')
      ]);
    } else {
      buildFields();
    }

    els.pricePanel = h('div', { class: 'ls-price', role: 'status', 'aria-live': 'polite' });
    els.tiers = h('ul', { class: 'ls-tiers', 'aria-label': 'Precio por cantidad' });
    els.addBtn = h('button', { class: 'btn btn-primary ls-add', type: 'button', text: general ? 'Añadir al pedido' : 'Añadir línea' });
    els.configMsg = h('p', { class: 'ls-note', role: 'status', 'aria-live': 'polite' });

    var configCard = h('section', { class: 'ls-card ls-config', 'aria-labelledby': uid + 'h1' }, [
      h('h3', { id: uid + 'h1', text: general ? '1. Añadir producto' : '1. Elige tu configuración' }),
      productField, configFields, els.pricePanel, els.tiers,
      h('div', { class: 'ls-actions' }, [els.addBtn]), els.configMsg
    ]);

    /* ----- Líneas ----- */
    els.linesHeading = h('h3', { id: uid + 'h2', tabindex: '-1', text: '2. Tu pedido' });
    els.linesList = h('div', { class: 'ls-lines-wrap' });
    els.linesEmpty = h('p', { class: 'ls-note', text: general ? 'Todavía no has añadido ningún producto.' : 'Todavía no has añadido ninguna línea.' });
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
        errP(id)
      ]);
    }
    els.notes = h('textarea', { id: uid + 'notes', name: 'notes', rows: '3', maxlength: '500', autocomplete: 'off' });
    var customerKids = [
      textField('name', 'Nombre completo', { type: 'text', autocomplete: 'name', maxlength: '80' }),
      textField('phone', 'Teléfono', { type: 'tel', autocomplete: 'tel', maxlength: '30', inputmode: 'tel' }),
      textField('email', 'Email', { type: 'email', autocomplete: 'email', maxlength: '120' }),
      h('div', { class: 'field field-full' }, [
        h('label', { for: uid + 'notes', text: 'Comentarios (opcional)' }), els.notes,
        h('small', { text: general ? 'Por ejemplo, el texto de una taza o el nombre y dorsal de cada camiseta.' : 'Por ejemplo, el texto de la taza o el nombre y dorsal de cada camiseta.' })
      ])
    ];
    if (general) {
      els.urgent = h('input', { type: 'checkbox', name: uid + 'urgent', value: '1' });
      customerKids.push(h('div', { class: 'field field-full' }, [
        h('label', { class: 'ls-choice ls-check' }, [els.urgent, h('span', { text: 'Necesito el pedido con urgencia (el plazo se presupuesta aparte)' })])
      ]));
    }
    var customerCard = h('section', { class: 'ls-card', 'aria-labelledby': uid + 'h3' }, [
      h('h3', { id: uid + 'h3', text: '3. Tus datos' }),
      h('div', { class: 'ls-config-fields' }, customerKids)
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
      var kindCosts = s.byKind ? Object.keys(s.byKind).map(function (kk) { return s.byKind[kk]; }) : [];
      var cost = general ? Math.min.apply(null, kindCosts.length ? kindCosts : [0]) : (s.byKind ? s.byKind[P.products[key].shippingKind] : 0);
      if (s.mode === 'from') extra = ' · desde ' + moneyUI(cost);
      else if (s.mode === 'fixed') extra = ' · ' + moneyUI(cost);
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
    var deliveryNote = general
      ? 'Envío aparte: textil desde 7,90 €; si el pedido incluye tazas, termos u otros productos frágiles, desde 9,90 €. Los envíos a Baleares, Canarias, Ceuta y Melilla se presupuestan.'
      : 'Envío aparte. Los envíos a Baleares, Canarias, Ceuta y Melilla se presupuestan.';
    var deliveryCard = h('section', { class: 'ls-card', 'aria-labelledby': uid + 'h4' }, [
      h('h3', { id: uid + 'h4', text: '4. Entrega' }), els.deliveryGroup, els.deliveryErr, els.addressBlock,
      h('p', { class: 'ls-note', text: deliveryNote })
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
    els.totalNotes = h('div', { class: 'ls-total-notes' });
    els.errorBox = h('div', { class: 'ls-errorbox', role: 'alert', tabindex: '-1', hidden: true });
    els.sendBtn = h('button', { class: 'btn btn-primary ls-send', type: 'submit', text: 'Finalizar por WhatsApp' });
    els.sent = h('div', { class: 'ls-sent', role: 'status', hidden: true });
    var totalCard = h('section', { class: 'ls-card ls-total-card', 'aria-labelledby': uid + 'h6' }, [
      h('h3', { id: uid + 'h6', text: '6. Total estimado' }),
      els.totals, els.volumeNote, els.totalNotes,
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
      var prod = curProd(), values = {};
      if (prod) {
        prod.fields.forEach(function (f) { values[f.id] = cur.ctl[f.id].value; });
        if (prod.extras) values.extras = cur.ctl.extras.value;
        if (prod.detail) values.detail = oneLine(cur.ctl.detail.value, 300);
        values.file = cur.ctl.file.value;
      }
      var raw = prod ? String(cur.ctl.qty.value).trim() : '';
      var qty = /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
      return { product: cur.key, values: values, qty: qty };
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
    function badge(status) { return h('span', { class: 'ls-badge ls-badge-' + status, text: P.statusLabels[status] }); }

    function renderPrice() {
      renderPriceInner();
      var pr = curProd();
      if (pr && pr.info) els.pricePanel.appendChild(h('p', { class: 'ls-price-sub', text: pr.info }));
    }

    function renderPriceInner() {
      var prod = curProd();
      els.pricePanel.textContent = '';
      els.tiers.textContent = '';
      if (!prod) {
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Elige un producto para ver sus opciones y su precio.' }));
        return;
      }
      if (productStatus(prod) === 'quote_required') {
        els.pricePanel.appendChild(badge('quote_required'));
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Este producto se presupuesta. Indícanos qué necesitas y te responderemos por WhatsApp con un precio.' }));
        return;
      }
      var cfg = readConfig();
      var variant = variantOf(prod, cfg.values);
      if (!variant) {
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Elige la configuración para ver el precio.' }));
        return;
      }
      if (prod.extras && prod.extras.required && !cfg.values.extras) {
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Elige el tipo de bordado para ver el precio.' }));
        return;
      }
      if (!hasPrices(variant)) {
        els.pricePanel.appendChild(badge('quote_required'));
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Esta configuración se presupuesta. Añádela al pedido y te indicaremos el precio.' }));
        return;
      }
      var estimated = prod.status === 'estimated';
      var qtyOk = isFinite(cfg.qty) && cfg.qty >= 1 && cfg.qty <= P.maxQuantity;
      var r = null;
      if (qtyOk) {
        var temp = previewLines(cfg);
        r = calcMixed(temp.lines, '').lines[temp.index];
      }
      variant.prices.forEach(function (p, i) {
        els.tiers.appendChild(h('li', { class: r && P.tiers[i] === r.tier ? 'is-current' : '' }, [
          h('span', { text: P.tiers[i] + (i === P.tiers.length - 1 ? '+ uds' : ' ud' + (P.tiers[i] === 1 ? '' : 's')) }),
          h('strong', { text: p == null ? 'A presupuestar' : moneyUI(p) })
        ]));
      });
      var volQuote = r && r.status === 'quote_required';
      if (general) els.pricePanel.appendChild(badge(volQuote ? 'quote_required' : prod.status));
      if (!qtyOk) {
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Indica una cantidad válida para ver el precio de la línea.' }));
        return;
      }
      if (r.status === 'quote_required') {
        if (!general) els.pricePanel.appendChild(badge('quote_required'));
        els.pricePanel.appendChild(h('p', { class: 'ls-price-hint', text: 'Para esta cantidad el precio se presupuesta. Añádela al pedido y te indicaremos el importe por WhatsApp.' }));
        return;
      }
      els.pricePanel.appendChild(h('p', { class: 'ls-price-main' }, [
        h('span', { text: estimated ? 'Precio unitario orientativo' : 'Precio unitario' }), h('strong', { text: moneyUI(r.unitCents) })
      ]));
      if (r.extraLabel) {
        var ex = findOption(prod.extras.options, cfg.values.extras);
        els.pricePanel.appendChild(h('p', { class: 'ls-price-sub', text: 'Suplemento: ' + (r.extraUnitCents > 0 ? '+' + moneyUI(r.extraUnitCents) + ' por unidad' : '') + (r.extraFixedCents > 0 ? (r.extraUnitCents > 0 ? ' + ' : '+') + moneyUI(r.extraFixedCents) + ' (pago único)' : (ex && ex.fixed ? ' (digitalización ya contada en otra línea)' : '')) }));
      }
      els.pricePanel.appendChild(h('p', { class: 'ls-price-sub' }, [estimated ? 'Subtotal orientativo de esta línea: ' : 'Subtotal de esta línea: ', h('strong', { text: moneyUI(r.lineCents) })]));
      if (estimated) els.pricePanel.appendChild(h('p', { class: 'ls-price-sub', text: prod.estimateNote || P.estimateNote }));
      if (r.volume) els.pricePanel.appendChild(h('p', { class: 'ls-volume', text: P.volumeNote }));
    }
    // Líneas del pedido + la que se está configurando (fusionando si ya existe igual).
    function previewLines(cfg) {
      var lines = state.lines.map(function (l) { return { product: l.product, values: l.values, qty: l.qty }; });
      var same = findSame(cfg.product, cfg.values);
      if (same) { var i = state.lines.indexOf(same); lines[i].qty = Math.min(same.qty + cfg.qty, P.maxQuantity); return { lines: lines, index: i }; }
      lines.push({ product: cfg.product, values: cfg.values, qty: cfg.qty });
      return { lines: lines, index: lines.length - 1 };
    }

    /* ----- Líneas ----- */
    function renderLines() {
      els.linesList.textContent = '';
      var has = state.lines.length > 0;
      els.linesEmpty.hidden = has;
      els.linesSubtotal.hidden = !has;
      var ordered = general ? orderLines(state.lines) : state.lines;
      var calc = has ? calcMixed(ordered, state.delivery) : null;
      var ul = null, lastProduct = null;
      ordered.forEach(function (line, i) {
        var prod = P.products[line.product], r = calc.lines[i];
        if (!ul || (general && line.product !== lastProduct)) {
          if (general) els.linesList.appendChild(h('h4', { class: 'ls-group-title', text: prod.label }));
          ul = h('ul', { class: 'ls-lines' });
          els.linesList.appendChild(ul);
          lastProduct = line.product;
        }
        var d = lineDescription(prod, line.values);
        var desc = unitsText(r.qty) + (d ? ' · ' + d : '');
        var fileOpt = findOption(prod.file.options, line.values.file);
        var meta, total;
        if (r.status === 'quote_required') {
          meta = (r.volumeQuote ? 'A presupuesto (pedido de volumen)' : 'A presupuesto') + (line.values.detail ? ' · ' + line.values.detail : '') + (fileOpt ? ' · ' + fileOpt.label : '');
          total = 'A presupuestar';
        } else {
          meta = (r.estimated ? 'Precio unitario orientativo ' : 'Precio unitario ') + moneyUI(r.unitCents) +
            (r.extraLabel ? ' · ' + r.extraLabel + ' ' + extraPriceText(r.extraUnitCents, r.extraFixedCents) : '') +
            (line.values.detail ? ' · ' + line.values.detail : '') + (fileOpt ? ' · ' + fileOpt.label : '');
          total = moneyUI(r.lineCents);
        }
        ul.appendChild(h('li', { class: 'ls-line' }, [
          h('div', { class: 'ls-line-main' }, [
            h('p', { class: 'ls-line-title', text: (i + 1) + ') ' + desc }),
            h('p', { class: 'ls-line-meta', text: meta }),
            r.volume ? h('p', { class: 'ls-volume', text: 'Pedido de volumen: precio final a revisar.' }) : null
          ]),
          h('div', { class: 'ls-line-side' }, [
            h('strong', { class: 'ls-line-total', text: total }),
            h('button', { class: 'ls-remove', type: 'button', 'data-id': String(line.id), 'aria-label': 'Quitar línea ' + (i + 1) + ': ' + prod.label + ', ' + desc, text: 'Quitar' })
          ])
        ]));
      });
      if (has) {
        var sub = calc.pricedCount === 0 ? 'a presupuestar' : moneyUI(calc.productsCents) + (calc.hasQuote ? ' + ' + calc.quoteCount + ' a presupuestar' : '');
        els.linesSubtotal.textContent = 'Subtotal productos: ' + sub;
        setLinesError('');
      }
    }
    function setLinesError(msg) {
      els.linesError.textContent = msg; els.linesError.hidden = !msg;
    }

    /* ----- Totales ----- */
    function renderTotals() {
      var ordered = general ? orderLines(state.lines) : state.lines;
      var calc = calcMixed(ordered, state.delivery);
      els.totals.textContent = '';
      function row(label, value, cls) {
        els.totals.appendChild(h('div', { class: 'ls-total-row ' + (cls || '') }, [h('dt', { text: label }), h('dd', { text: value })]));
      }
      var has = state.lines.length > 0;
      row('Subtotal productos', has ? (calc.pricedCount === 0 ? 'A presupuestar' : moneyUI(calc.productsCents)) : '—');
      var ship;
      if (calc.shippingPending) ship = 'Elige entrega';
      else if (calc.shippingQuote) ship = 'A presupuestar';
      else if (calc.shipping.mode === 'from') ship = 'desde ' + moneyUI(calc.shippingCents);
      else ship = moneyUI(calc.shippingCents);
      row('Envío estimado', ship);
      var totalText = '—';
      if (has) {
        if (calc.pricedCount === 0) totalText = 'A presupuestar';
        else totalText = moneyUI(calc.totalCents) + (calc.shippingQuote && calc.hasQuote ? ' + envío y productos a presupuestar' : calc.shippingQuote ? ' + envío' : calc.hasQuote ? ' + a presupuestar' : '');
      }
      row('Total estimado', totalText, 'is-total');
      els.volumeNote.hidden = !calc.volume;
      els.totalNotes.textContent = '';
      if (calc.hasEstimated) els.totalNotes.appendChild(h('p', { class: 'ls-note', text: P.estimateTotalNote }));
      if (calc.multiLogo) els.totalNotes.appendChild(h('p', { class: 'ls-note', text: P.multiLogoNote }));
      if (calc.hasQuote) els.totalNotes.appendChild(h('p', { class: 'ls-note', text: 'Hay ' + calc.quoteCount + (calc.quoteCount === 1 ? ' línea' : ' líneas') + ' a presupuestar: no están incluidas en el total.' }));
      if (calc.shippingReview) els.totalNotes.appendChild(h('p', { class: 'ls-note', text: 'El envío se revisará según el pedido final.' }));
      return calc;
    }

    function renderAll() { renderLines(); renderTotals(); }

    /* ----- Eventos: configuración ----- */
    function configIds() {
      var prod = curProd();
      return prod ? prod.fields.map(function (f) { return f.id; }).concat(['file', 'qty'].concat(prod.extras && prod.extras.required ? ['extras'] : [])) : [];
    }
    function clearConfigErrors() {
      configIds().forEach(function (id) { if (cur.ctl[id]) setError(cur.ctl[id], errElFor(id), ''); });
      if (els.productSel) setError(els.productSel, errElFor('product'), '');
    }

    function findSame(product, values) {
      for (var i = 0; i < state.lines.length; i++) {
        var l = state.lines[i];
        if (l.product !== product) continue;
        var same = true;
        Object.keys(values).forEach(function (k) { if (l.values[k] !== values[k]) same = false; });
        if (same) return l;
      }
      return null;
    }

    function addLine() {
      clearConfigErrors();
      els.configMsg.textContent = '';
      var prod = curProd();
      if (!prod) {
        setError(els.productSel, errElFor('product'), 'Elige un producto para añadirlo al pedido.');
        els.productSel.focus();
        return;
      }
      var cfg = readConfig();
      var first = null, bad = false;
      var required = prod.fields.concat([{ id: 'file', label: prod.file.label }]);
      if (prod.extras && prod.extras.required) required.push({ id: 'extras', label: prod.extras.label });
      required.forEach(function (f) {
        if (!cfg.values[f.id]) {
          setError(cur.ctl[f.id], errElFor(f.id), 'Elige una opción en «' + f.label + '».');
          if (!first) first = cur.ctl[f.id];
          bad = true;
        }
      });
      if (!isFinite(cfg.qty) || cfg.qty < 1) {
        setError(cur.ctl.qty, errElFor('qty'), 'Indica una cantidad entera de 1 o más.');
        if (!first) first = cur.ctl.qty; bad = true;
      } else if (cfg.qty > P.maxQuantity) {
        setError(cur.ctl.qty, errElFor('qty'), 'Para más de ' + P.maxQuantity + ' unidades escríbenos y lo valoramos.');
        if (!first) first = cur.ctl.qty; bad = true;
      }
      if (bad) { first.focus(); return; }
      var same = findSame(cfg.product, cfg.values);
      if (state.lines.length >= 20 && !same) {
        els.configMsg.textContent = 'Máximo 20 líneas por pedido. Para pedidos mayores, escríbenos por WhatsApp.';
        return;
      }
      var idx, ordered;
      if (same) {
        same.qty += cfg.qty;
        if (same.qty > P.maxQuantity) same.qty = P.maxQuantity;
        ordered = general ? orderLines(state.lines) : state.lines;
        idx = ordered.indexOf(same) + 1;
        els.configMsg.textContent = 'Cantidad sumada a la línea ' + idx + '.';
      } else {
        state.lines.push({ id: nextId++, product: cfg.product, values: cfg.values, qty: cfg.qty });
        ordered = general ? orderLines(state.lines) : state.lines;
        idx = ordered.indexOf(state.lines[state.lines.length - 1]) + 1;
        els.configMsg.textContent = (general ? 'Producto añadido al pedido (línea ' : 'Línea ') + idx + (general ? ').' : ' añadida a tu pedido.');
      }
      announce(els.configMsg.textContent);
      renderAll(); renderPrice();
    }

    els.addBtn.addEventListener('click', addLine);
    configCard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.name === 'qty') { e.preventDefault(); addLine(); }
    });
    configCard.addEventListener('input', renderPrice);
    configCard.addEventListener('change', function (e) {
      var t = e.target;
      if (t === els.productSel) {
        cur.key = t.value;
        els.configMsg.textContent = '';
        setError(els.productSel, errElFor('product'), '');
        buildFields();
        renderPrice();
        return;
      }
      renderPrice();
      if (t && t.id && cur.ctl[t.name] === t) setError(t, errElFor(t.name), '');
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
      state.urgent = !!(els.urgent && els.urgent.checked);
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
          if (id === 'lines') firstFocus = general ? els.productSel : els.addBtn;
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
      window.dataLayer.push({ event: 'whatsapp_click', product: general ? 'Pedido general' : P.products[key].label, source: 'order_builder', page_path: location.pathname });
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
