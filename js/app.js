(function () {
  'use strict';

  var PLACES = window.SUWON_PLACES || [];
  var META = window.SUWON_META || {};
  var GU = [
    { key: '장안구', color: '#2f6bd6' },
    { key: '권선구', color: '#e0811b' },
    { key: '팔달구', color: '#b43f97' },
    { key: '영통구', color: '#179a77' }
  ];
  var GU_COLOR = {};
  GU.forEach(function (g) { GU_COLOR[g.key] = g.color; });
  var GU_ORDER = { '장안구': 0, '권선구': 1, '팔달구': 2, '영통구': 3 };
  var KIND_LABEL = { box: '수거함', health: '보건소', pharmacy: '약국' };
  var SUBS = {
    box: [
      { key: 'all', label: '전체' },
      { key: '행정복지센터', label: '행정복지센터' },
      { key: '공동주택', label: '공동주택(아파트)' }
    ],
    pharmacy: [
      { key: 'all', label: '전체' },
      { key: 'general', label: '일반의약품 수거' },
      { key: 'narcOnly', label: '마약류만 수거' }
    ]
  };

  var state = { kind: 'all', gu: 'all', sub: 'all', q: '', near: false, me: null, sel: null };

  var $ = function (s) { return document.querySelector(s); };
  var app = $('#app');
  var isMobile = function () { return window.matchMedia('(max-width: 760px)').matches; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s·.,()\-]/g, ''); }

  PLACES.forEach(function (p) {
    p._hay = norm([p.name, p.addr, p.jibun, p.dong, p.gu, p.sub, KIND_LABEL[p.kind]].join(' '));
    p.narcOnly = p.kind === 'pharmacy' && p.general !== '수거 가능' && p.narcotic === '수거 가능';
  });

  /* ===== 거리 ===== */
  function dist(a, b) {
    var R = 6371000, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function fmtDist(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + 'm';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0) + 'km';
  }

  /* ===== 필터 ===== */
  function matchBase(p) {
    if (state.gu !== 'all' && p.gu !== state.gu) return false;
    if (state.q) {
      var words = state.q.split(/\s+/).map(norm).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (p._hay.indexOf(words[i]) < 0) return false;
    }
    return true;
  }
  function matchSub(p) {
    if (state.sub === 'all') return true;
    if (state.kind === 'box') return p.sub === state.sub;
    if (state.kind === 'pharmacy') return state.sub === 'general' ? p.general === '수거 가능' : p.narcOnly;
    return true;
  }
  function filtered() {
    var out = PLACES.filter(function (p) {
      return matchBase(p) && (state.kind === 'all' || p.kind === state.kind) && matchSub(p);
    });
    if (state.near && state.me) {
      out.forEach(function (p) { p._d = p.lat == null ? Infinity : dist(state.me, p); });
      out.sort(function (a, b) { return a._d - b._d; });
    } else {
      var kOrder = { health: 0, pharmacy: 1, box: 2 };
      out.sort(function (a, b) {
        return (GU_ORDER[a.gu] - GU_ORDER[b.gu]) ||
          (kOrder[a.kind] - kOrder[b.kind]) ||
          (a.sub === b.sub ? 0 : a.sub === '행정복지센터' ? -1 : 1) ||
          a.name.localeCompare(b.name, 'ko');
      });
    }
    return out;
  }

  /* ===== 지도 ===== */
  var map = L.map('map', { zoomControl: false, minZoom: 11, maxZoom: 19 })
    .setView([37.2766, 127.0089], 12);
  L.control.zoom({ position: 'topright', zoomInTitle: '확대', zoomOutTitle: '축소' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · 행정경계 통계청(<a href="https://github.com/vuski/admdongkor">admdongkor</a>, CC BY 4.0)'
  }).addTo(map);

  var dongLayer = L.geoJSON(window.SUWON_DONG, {
    style: function (f) { return dongStyle(f.properties.gu); },
    onEachFeature: function (f, layer) {
      layer.bindTooltip(f.properties.gu + ' ' + f.properties.dong, { sticky: true, className: 'tip', direction: 'top', offset: [0, -6] });
      layer.on('click', function () { if (state.gu !== f.properties.gu) setGu(f.properties.gu, true); });
    }
  }).addTo(map);
  var lineLayer = L.geoJSON(window.SUWON_GU_LINE, {
    interactive: false,
    style: function (f) { return lineStyle(f.properties.gu); }
  }).addTo(map);

  function dongStyle(gu) {
    var on = state.gu === 'all' || state.gu === gu;
    var k = map && map.getZoom() >= 15 ? 0.45 : 1; // 골목 단위로 확대하면 색을 옅게
    return {
      color: GU_COLOR[gu], weight: 0.8, opacity: on ? 0.5 : 0.15,
      fillColor: GU_COLOR[gu], fillOpacity: (state.gu === gu ? 0.34 : (on ? 0.24 : 0.05)) * k
    };
  }
  function lineStyle(gu) {
    var on = state.gu === 'all' || state.gu === gu;
    return { color: GU_COLOR[gu], weight: state.gu === gu ? 3.5 : 2.5, opacity: on ? 0.95 : 0.3 };
  }

  // 구 이름 표시 (동 중심점 평균)
  var guLabels = {};
  var guBounds = {};
  dongLayer.eachLayer(function (l) {
    var gu = l.feature.properties.gu;
    guBounds[gu] = guBounds[gu] ? guBounds[gu].extend(l.getBounds()) : L.latLngBounds(l.getBounds().getSouthWest(), l.getBounds().getNorthEast());
  });
  var LABEL_POS = { '장안구': [37.3035, 126.9905], '권선구': [37.2560, 126.9700], '팔달구': [37.2790, 127.0160], '영통구': [37.2700, 127.0640] };
  GU.forEach(function (g) {
    guLabels[g.key] = L.marker(LABEL_POS[g.key], {
      interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'gu-label', html: '<span style="--c:' + g.color + '">' + g.key + '</span>', iconSize: null })
    }).addTo(map);
  });
  map.on('zoomend', function () { dongLayer.setStyle(function (f) { return dongStyle(f.properties.gu); }); });
  var cityBounds = dongLayer.getBounds();
  map.fitBounds(cityBounds, { padding: [10, 10] });

  // 폰처럼 화면 배율이 높으면, 지도 상자가 픽셀 사이(예: 0.14px)에 걸릴 때 타일 이음매에 가는 줄이 보여요.
  // 지도 상자를 화면 픽셀에 딱 맞게 아주 살짝 옮겨요. 페이지 높이가 바뀔 때마다 다시 맞춰요.
  (function snapMapToPixels() {
    var el = document.getElementById('map');
    function snap() {
      el.style.transform = '';
      var r = el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var fx = ((r.left + window.scrollX) * dpr) % 1, fy = ((r.top + window.scrollY) * dpr) % 1;
      if (fx < 0.01 && fy < 0.01) return;
      el.style.transform = 'translate(' + (-fx / dpr) + 'px,' + (-fy / dpr) + 'px)';
    }
    var queued = false;
    function queue() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; snap(); }); }
    snap();
    window.addEventListener('resize', queue);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
    if (window.ResizeObserver) { var ro = new ResizeObserver(queue); ro.observe(document.body); ro.observe(el); }
  })();
  map.setMaxBounds(cityBounds.pad(0.6));

  // 마커 — 물방울 핀 아이콘 + 멀리서 볼 때는 수거함을 묶어서(클러스터) 표시
  var markers = {};
  var clusterLayer = L.markerClusterGroup({
    maxClusterRadius: 48,
    disableClusteringAtZoom: 15,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    chunkedLoading: true,
    iconCreateFunction: function (c) {
      var n = c.getChildCount();
      var size = n < 5 ? 34 : n < 15 ? 40 : 48;
      return L.divIcon({
        className: '',
        html: '<span class="cl" style="--s:' + size + 'px"><b>' + n + '</b></span>',
        iconSize: [size, size], iconAnchor: [size / 2, size / 2]
      });
    }
  }).addTo(map);
  var pinLayer = L.layerGroup().addTo(map); // 보건소·약국은 항상 낱개로
  var seen = {};

  var PIN_PATH = 'M14 1.2C7.1 1.2 1.6 6.6 1.6 13.4c0 8.4 10.3 19 11.4 20.1a1.4 1.4 0 0 0 2 0c1.1-1.1 11.4-11.7 11.4-20.1C26.4 6.6 20.9 1.2 14 1.2z';
  function pinSvg(kind, opt) {
    opt = opt || {};
    var fill, stroke, glyph;
    if (kind === 'health') {
      fill = '#e0484d'; stroke = '#fff';
      glyph = '<path d="M14 8.4v9.6M9.2 13.2h9.6" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>';
    } else if (kind === 'pharmacy') {
      var c = opt.narc ? '#8a939d' : '#0f8a5f';
      fill = '#fff'; stroke = c;
      glyph = '<text x="14" y="17.4" text-anchor="middle" font-size="11.5" font-weight="800" fill="' + c + '" font-family="Pretendard Variable, Pretendard, Apple SD Gothic Neo, sans-serif">약</text>';
    } else {
      fill = opt.apt ? '#2f8f68' : '#13492d'; stroke = '#fff';
      glyph = '<rect x="8.6" y="8.6" width="10.8" height="9.6" rx="2" fill="none" stroke="#fff" stroke-width="1.9"/>' +
        '<path d="M11.6 12h4.8" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>';
    }
    return '<svg class="pin-svg" viewBox="0 0 28 36" width="28" height="36" aria-hidden="true">' +
      '<path d="' + PIN_PATH + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (kind === 'pharmacy' ? 2.2 : 1.6) + '"/>' +
      glyph + '</svg>';
  }
  function iconFor(p, on) {
    var html = '<span class="pin pin-' + p.kind + (on ? ' on' : '') + '">' +
      pinSvg(p.kind, { apt: p.sub === '공동주택', narc: p.narcOnly }) + '</span>';
    return L.divIcon({ className: '', html: html, iconSize: [28, 36], iconAnchor: [14, 35] });
  }
  PLACES.forEach(function (p) {
    if (p.lat == null) return;
    // 좌표가 완전히 같은 곳(예: 같은 단지 1·2단지)은 화면에서만 살짝 떨어뜨려 둘 다 보이게 한다
    var k = p.lat.toFixed(6) + ',' + p.lng.toFixed(6);
    var n = seen[k] = (seen[k] || 0) + 1;
    var pos = [p.lat + (n - 1) * 0.00008, p.lng + (n - 1) * 0.00008];
    var m = L.marker(pos, {
      icon: iconFor(p, false), title: p.name, riseOnHover: true,
      zIndexOffset: p.kind === 'box' ? 0 : 500
    });
    m.bindTooltip(esc(p.name), { className: 'tip', direction: 'top', offset: [0, -32] });
    m.on('click', function () { select(p.id, { fly: false }); });
    markers[p.id] = m;
  });

  var meMarker = null;

  /* ===== 렌더링 ===== */
  function renderTabs() {
    var c = { all: 0, box: 0, health: 0, pharmacy: 0 };
    PLACES.forEach(function (p) { if (matchBase(p)) { c.all++; c[p.kind]++; } });
    Object.keys(c).forEach(function (k) {
      var el = document.querySelector('[data-count="' + k + '"]');
      if (el) el.textContent = c[k];
    });
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.kind === state.kind));
    });
  }

  function renderGuChips() {
    var html = '<button class="chip" data-gu="all" aria-pressed="' + (state.gu === 'all') + '">전체</button>';
    GU.forEach(function (g) {
      html += '<button class="chip" data-gu="' + g.key + '" style="--c:' + g.color + '" aria-pressed="' + (state.gu === g.key) + '"><span class="dot"></span>' + g.key + '</button>';
    });
    $('#guChips').innerHTML = html;
  }

  function renderSubChips() {
    var subs = SUBS[state.kind];
    var box = $('#subChips');
    if (!subs) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = subs.map(function (s) {
      return '<button class="chip" data-sub="' + s.key + '" aria-pressed="' + (state.sub === s.key) + '">' + s.label + '</button>';
    }).join('');
  }

  function itemMeta(p) {
    var bits = ['<span class="gu-tag" style="--c:' + GU_COLOR[p.gu] + '">' + esc(p.gu) + (p.dong ? ' ' + esc(p.dong) : '') + '</span>'];
    bits.push(esc(p.kind === 'box' ? p.sub + ' 수거함' : p.sub));
    if (p.kind === 'pharmacy') {
      bits.push(p.general === '수거 가능' ? '<span class="tag ok">일반의약품</span>' : '<span class="tag warn">마약류만</span>');
    }
    if (p.approx) bits.push('<span class="tag mute">대략 위치</span>');
    else if (p.lat == null) bits.push('<span class="tag mute">지도 미표시</span>');
    return bits.join('<span class="sep">|</span>');
  }

  var lastList = [];
  function renderList() {
    var list = filtered();
    lastList = list;
    var count = list.length;
    $('#resultCount').innerHTML = (state.q ? '‘' + esc(state.q) + '’ ' : '') + '<b>' + count + '</b>곳';
    if (!count) {
      $('#list').innerHTML = '<li class="empty"><b>찾는 곳이 없어요</b>다른 이름이나 동 이름으로 검색하거나, 구·종류 선택을 바꿔 보세요.</li>';
    } else {
      $('#list').innerHTML = list.map(function (p) {
        var d = state.near && state.me && p._d !== Infinity ? '<span class="dist">' + fmtDist(p._d) + '</span>' : '<span></span>';
        return '<li class="item' + (state.sel === p.id ? ' on' : '') + '" data-id="' + p.id + '" tabindex="0">' +
          '<span class="name">' + esc(p.name) + '</span>' + d +
          '<span class="meta">' + itemMeta(p) + '</span>' +
          '<span class="addr">' + esc(p.addr) + '</span></li>';
      }).join('');
    }
    // 지도 마커 갱신
    clusterLayer.clearLayers();
    pinLayer.clearLayers();
    var boxes = [];
    list.forEach(function (p) {
      var m = markers[p.id];
      if (!m) return;
      if (p.kind === 'box') boxes.push(m); else pinLayer.addLayer(m);
    });
    clusterLayer.addLayers(boxes);
    renderLegend();
  }

  function renderLegend() {
    var c = {};
    PLACES.forEach(function (p) {
      if ((state.kind === 'all' || p.kind === state.kind) && matchSub(p)) c[p.gu] = (c[p.gu] || 0) + 1;
    });
    var guRow = GU.map(function (g) {
      var off = state.gu !== 'all' && state.gu !== g.key;
      return '<button class="gu-btn' + (off ? ' off' : '') + '" data-gu="' + g.key + '" style="--c:' + g.color + '"><i></i>' + g.key + ' <em>' + (c[g.key] || 0) + '</em></button>';
    }).join('');
    var kindRow =
      '<span class="kind"><span class="lg-pin">' + pinSvg('box') + '</span>수거함</span>' +
      '<span class="kind"><span class="lg-pin">' + pinSvg('health') + '</span>보건소</span>' +
      '<span class="kind"><span class="lg-pin">' + pinSvg('pharmacy') + '</span>약국</span>' +
      '<span class="kind"><span class="lg-pin">' + pinSvg('pharmacy', { narc: true }) + '</span>마약류만</span>' +
      '<span class="kind"><span class="cl lg-cl" style="--s:22px"><b>5</b></span>수거함 묶음</span>';
    $('#legend').innerHTML = '<div class="row">' + guRow + '</div><hr><div class="row kinds-row">' + kindRow + '</div>';
  }

  function restyleAreas() {
    dongLayer.setStyle(function (f) { return dongStyle(f.properties.gu); });
    lineLayer.setStyle(function (f) { return lineStyle(f.properties.gu); });
    GU.forEach(function (g) {
      var el = guLabels[g.key].getElement();
      if (el) el.style.opacity = state.gu === 'all' || state.gu === g.key ? 1 : 0.35;
    });
  }

  function renderAll() {
    renderTabs();
    renderGuChips();
    renderSubChips();
    renderList();
    restyleAreas();
  }

  /* ===== 상세 ===== */
  function row(label, value) {
    return '<div class="d-row"><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }
  function renderDetail(p) {
    var hasPos = p.lat != null;
    var kakao = hasPos && !p.approx
      ? 'https://map.kakao.com/link/to/' + encodeURIComponent(p.name) + ',' + p.lat + ',' + p.lng
      : 'https://map.kakao.com/?q=' + encodeURIComponent(p.addr);
    var naver = 'https://map.naver.com/p/search/' + encodeURIComponent(p.addr.replace(/\s*\(.*\)$/, '').replace(/,.*$/, ''));
    var tel = p.tel ? 'tel:' + p.tel.replace(/[^\d]/g, '') : '';

    var kindLine = '<span class="gu-tag" style="--c:' + GU_COLOR[p.gu] + '">' + esc(p.gu) + (p.dong ? ' ' + esc(p.dong) : '') + '</span><span class="sep">|</span>' +
      esc(p.kind === 'box' ? p.sub + ' 수거함' : p.sub);

    var accept = '';
    if (p.kind === 'pharmacy' || (p.kind === 'health' && p.general)) {
      var gOk = p.general === '수거 가능', nOk = p.narcotic === '수거 가능';
      accept = row('수거 품목',
        '<div class="accept">' +
        '<span class="' + (gOk ? '' : 'no') + '"><i>' + (gOk ? '✓' : '–') + '</i>일반의약품 ' + (gOk ? '수거' : '수거 안 함') + '</span>' +
        '<span class="' + (nOk ? '' : 'no') + '"><i>' + (nOk ? '✓' : '–') + '</i>마약류 ' + (nOk ? '수거' : '수거 안 함') + '</span>' +
        '</div><small>자료상 수거 협력 여부예요. 방문 전 확인하세요.</small>');
    }

    var detailLoc = p.detail
      ? esc(p.detail) + (p.detailSrc
        ? '<small>출처: ' + (p.detailUrl ? '<a href="' + esc(p.detailUrl) + '" target="_blank" rel="noopener">' + esc(p.detailSrc) + '</a>' : esc(p.detailSrc)) + '</small>'
        : '<small>자료상 위치예요</small>')
      : '<span class="none">자료에 없음</span><small>' + (p.kind === 'box' && p.sub === '공동주택' ? '관리사무소에 위치를 문의하세요.' : '안내 데스크나 직원에게 문의하세요.') + '</small>';

    var boxRow = p.kind === 'pharmacy'
      ? '약국 직원에게 전달<small>수거함 비치 여부는 자료에 없어요</small>'
      : '수거함 설치<small>' + (p.installed ? '설치일 ' + esc(p.installed) + ' · ' : '') + '운영 여부가 바뀌었을 수 있으니 방문 전에 전화로 확인하세요.</small>';

    var hoursRow = p.kind === 'pharmacy'
      ? '약국 영업시간<small>정확한 시간은 자료에 없어요 · 방문 전 전화로 확인하세요</small>'
      : p.sub === '공동주택'
        ? '단지 출입이 가능한 시간<small>외부인은 출입이 제한될 수 있어요</small>'
        : '기관 운영 시간 안에 이용<small>정확한 시간은 자료에 없어요 · 주말·공휴일엔 이용이 어려울 수 있어요</small>';

    // 수거 품목 (약국·팔달구보건소는 자료의 협력 여부, 그 외는 수원시 안내 기준)
    if (!accept) {
      accept = row('수거 품목', '알약·가루약·물약·안약·연고<small>수원시 수거함 안내 기준 · <a href="#guide" data-act="guide">제형별 준비 방법 보기</a></small>');
    }

    var srcText = esc(p.source) + (p.date ? '<small>데이터 기준일 ' + esc(p.date) + '</small>' : '') +
      (p.installed ? '<small>수거함 설치일 ' + esc(p.installed) + '</small>' : '');

    var tip = '';
    if (p.kind === 'box' && p.sub === '공동주택') {
      tip = '<div class="d-tip"><b>공동주택 수거함</b>은 단지 안에 있어 외부인 출입이 제한될 수 있어요. 거주 단지가 아니라면 가까운 행정복지센터·보건소를 이용하세요.</div>';
    } else if (p.narcOnly) {
      tip = '<div class="d-tip">이 약국은 자료상 <b>마약류(향정신성 의약품 등)만</b> 받아요. 일반 알약·물약은 가까운 수거함이나 보건소에 배출하세요.</div>';
    }

    var notes = p.notes && p.notes.length
      ? '<div class="d-notes"><b>확인이 필요한 정보</b><ul>' + p.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>'
      : '';

    $('#detail').innerHTML =
      '<div class="d-bar"><button class="back" type="button" data-act="back">' +
      '<i class="ph-bold ph-caret-left" aria-hidden="true"></i>목록</button>' +
      (p.date ? '<span class="tag mute">' + esc(p.date.replace(/-/g, '.')) + ' 기준</span>' : '') + '</div>' +
      '<div class="d-head"><div class="d-kind">' + kindLine + '</div><h2>' + esc(p.name) + '</h2></div>' +
      '<div class="d-actions">' +
      '<a class="primary" href="' + kakao + '" target="_blank" rel="noopener">' + svgRoute() + '길찾기</a>' +
      '<a href="' + (tel || '#') + '"' + (tel ? '' : ' aria-disabled="true"') + '>' + svgPhone() + '전화</a>' +
      '<button type="button" data-act="copy">' + svgCopy() + '<span>주소 복사</span></button>' +
      '</div>' +
      '<dl class="d-rows">' +
      row('주소', esc(p.addr) + (p.jibun ? '<small>지번 ' + esc(p.jibun.replace(/^경기도 수원시 /, '')) + '</small>' : '')) +
      row('세부 위치', detailLoc) +
      row('수거 방식', boxRow) +
      accept +
      row('이용 시간', hoursRow) +
      row('전화', p.tel ? '<a href="' + tel + '">' + esc(p.tel) + '</a>' + (p.org ? '<small>' + esc(p.org) + ' 관리</small>' : '') : '<span class="none">자료에 없음</span>') +
      row('지도', '<a href="' + naver + '" target="_blank" rel="noopener">네이버 지도에서 보기</a>') +
      row('출처', srcText) +
      '</dl>' + tip + notes;
    $('#detail').hidden = false;
    $('#detail').scrollTop = 0;
    app.classList.add('has-detail');
    document.body.classList.add('detail-open');
  }
  function svgRoute() { return '<i class="ph-fill ph-navigation-arrow" aria-hidden="true"></i>'; }
  function svgPhone() { return '<i class="ph-fill ph-phone" aria-hidden="true"></i>'; }
  function svgCopy() { return '<i class="ph ph-copy" aria-hidden="true"></i>'; }

  function byId(id) { for (var i = 0; i < PLACES.length; i++) if (PLACES[i].id === id) return PLACES[i]; return null; }

  function setMarkerOn(id, on) {
    var p = byId(id), m = markers[id];
    if (p && m) { m.setIcon(iconFor(p, on)); m.setZIndexOffset(on ? 1000 : (p.kind === 'box' ? 0 : 500)); }
  }

  function select(id, opts) {
    opts = opts || {};
    var p = byId(id);
    if (!p) return;
    if (state.sel && state.sel !== id) setMarkerOn(state.sel, false);
    state.sel = id;
    setMarkerOn(id, true);
    document.querySelectorAll('.item.on').forEach(function (el) { el.classList.remove('on'); });
    var li = document.querySelector('.item[data-id="' + id + '"]');
    if (li) li.classList.add('on');
    renderDetail(p);
    if (isMobile() && app.dataset.view === 'list' && p.lat != null) app.dataset.view = 'map';
    if (p.lat != null) {
      map.invalidateSize();
      var z = Math.max(map.getZoom(), 16);
      if (opts.fly === false) {
        if (isMobile()) map.panTo(offsetForSheet([p.lat, p.lng], map.getZoom()));
      } else {
        map.flyTo(isMobile() ? offsetForSheet([p.lat, p.lng], z) : [p.lat, p.lng], z, { duration: 0.6 });
      }
    }
    history.replaceState(null, '', '#p=' + id);
  }
  // 모바일에서 아래 시트에 가리지 않도록 지점을 화면 위쪽에 둔다
  function offsetForSheet(latlng, zoom) {
    var px = map.project(latlng, zoom);
    px.y += Math.round(map.getSize().y * 0.27);
    return map.unproject(px, zoom);
  }

  function closeDetail() {
    if (state.sel) setMarkerOn(state.sel, false);
    state.sel = null;
    $('#detail').hidden = true;
    app.classList.remove('has-detail');
    document.body.classList.remove('detail-open');
    document.querySelectorAll('.item.on').forEach(function (el) { el.classList.remove('on'); });
    history.replaceState(null, '', location.pathname + location.search);
  }

  /* ===== 동작 ===== */
  function setGu(gu, fromMap) {
    state.gu = gu;
    renderAll();
    if (gu === 'all') map.flyToBounds(cityBounds, { padding: [10, 10], duration: 0.5 });
    else if (guBounds[gu]) map.flyToBounds(guBounds[gu], { padding: [24, 24], duration: 0.5 });
    if (fromMap && isMobile()) {
      var chip = document.querySelector('#guChips [data-gu="' + gu + '"]');
      if (chip) chip.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }

  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-kind]');
    if (!b) return;
    state.kind = b.dataset.kind;
    state.sub = 'all';
    renderAll();
  });
  $('#guChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-gu]');
    if (b) setGu(b.dataset.gu === state.gu ? 'all' : b.dataset.gu);
  });
  $('#legend').addEventListener('click', function (e) {
    var b = e.target.closest('[data-gu]');
    if (b) setGu(b.dataset.gu === state.gu ? 'all' : b.dataset.gu);
  });
  $('#subChips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sub]');
    if (!b) return;
    state.sub = b.dataset.sub;
    renderSubChips();
    renderList();
  });

  var qTimer;
  $('#q').addEventListener('input', function (e) {
    clearTimeout(qTimer);
    $('#qClear').hidden = !e.target.value;
    qTimer = setTimeout(function () {
      state.q = e.target.value.trim();
      renderTabs();
      renderList();
      fitToResults();
    }, 140);
  });
  $('#q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.target.blur();
      if (lastList.length === 1) select(lastList[0].id);
      else if (isMobile() && state.q) app.dataset.view = 'list';
    }
  });
  $('#qClear').addEventListener('click', function () {
    $('#q').value = '';
    $('#qClear').hidden = true;
    state.q = '';
    renderTabs();
    renderList();
    $('#q').focus();
  });
  function fitToResults() {
    if (!state.q) return;
    var pts = lastList.filter(function (p) { return p.lat != null; }).map(function (p) { return [p.lat, p.lng]; });
    if (pts.length) map.flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16, duration: 0.5 });
  }

  $('#list').addEventListener('click', function (e) {
    var li = e.target.closest('.item');
    if (li) select(Number(li.dataset.id));
  });
  $('#list').addEventListener('keydown', function (e) {
    var li = e.target.closest('.item');
    if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(Number(li.dataset.id)); }
  });
  $('#detail').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'back') closeDetail();
    if (b.dataset.act === 'guide') { e.preventDefault(); if (isMobile()) closeDetail(); document.getElementById('guide').scrollIntoView({ behavior: 'smooth' }); }
    if (b.dataset.act === 'copy') {
      var p = byId(state.sel);
      if (!p) return;
      var done = function () { b.querySelector('span').textContent = '복사됨'; setTimeout(function () { b.querySelector('span').textContent = '주소 복사'; }, 1400); };
      if (navigator.clipboard) navigator.clipboard.writeText(p.addr).then(done, function () { prompt('주소', p.addr); });
      else prompt('주소', p.addr);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.sel && !$('#info').open) closeDetail();
  });
  map.on('click', function () { if (isMobile() && state.sel) closeDetail(); });

  $('#viewToggle').addEventListener('click', function () {
    app.dataset.view = app.dataset.view === 'map' ? 'list' : 'map';
    if (app.dataset.view === 'map') setTimeout(function () { map.invalidateSize(); }, 0);
  });

  // 위치
  function locate(then) {
    if (!navigator.geolocation) { alert('이 브라우저에서는 위치를 확인할 수 없어요.'); return; }
    var btn = $('#locateBtn');
    btn.classList.add('busy');
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.classList.remove('busy');
      btn.classList.add('on');
      state.me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (meMarker) meMarker.setLatLng([state.me.lat, state.me.lng]);
      else meMarker = L.marker([state.me.lat, state.me.lng], {
        interactive: false, zIndexOffset: 2000,
        icon: L.divIcon({ className: '', html: '<span class="mk mk-me"></span>', iconSize: [22, 22], iconAnchor: [11, 11] })
      }).addTo(map);
      if (then) then();
    }, function (err) {
      btn.classList.remove('busy');
      alert(err.code === 1 ? '위치 권한이 거부되었어요. 브라우저 설정에서 위치 접근을 허용해 주세요.' : '현재 위치를 가져오지 못했어요.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  $('#locateBtn').addEventListener('click', function () {
    locate(function () { map.flyTo([state.me.lat, state.me.lng], 15, { duration: 0.6 }); });
  });
  $('#nearBtn').addEventListener('click', function () {
    if (state.near) {
      state.near = false;
      $('#nearBtn').setAttribute('aria-pressed', 'false');
      renderList();
      return;
    }
    locate(function () {
      state.near = true;
      $('#nearBtn').setAttribute('aria-pressed', 'true');
      renderList();
      $('#list').scrollTop = 0;
    });
  });

  // 안내창
  (function initInfo() {
    $('#infoBtn').addEventListener('click', function () { $('#info').showModal(); });
    $('#info').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
    $('#toData').addEventListener('click', function () { $('#info').close(); });
  })();

  // 화면의 자료 기준일 등 채우기
  (function initData() {
    document.querySelectorAll('[data-meta]').forEach(function (el) {
      var v = META[el.dataset.meta];
      el.textContent = /Date|built/.test(el.dataset.meta) ? String(v || '').replace(/-/g, '.') : (v == null ? '-' : v);
    });

  })();

  // 배출 방법 그림: 폰에서 누르면 잠깐 기울었다 돌아와요 (컴퓨터는 CSS hover)
  document.querySelectorAll('.tiles li').forEach(function (li) {
    li.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      clearTimeout(li._tapTimer);
      li.classList.add('tap');
      li._tapTimer = setTimeout(function () { li.classList.remove('tap'); }, 450);
    });
  });

  // '출처'로 가는 링크를 누르면 접힌 출처 목록을 펼쳐요
  document.querySelectorAll('a[href="#data"]').forEach(function (a) {
    a.addEventListener('click', function () { var d = document.querySelector('.src-fold'); if (d) d.open = true; });
  });

  /* ===== 랜딩(상단 소개) 연결 ===== */
  function goFinder() {
    var gap = isMobile() ? 0 : 24;
    window.scrollTo({ top: app.getBoundingClientRect().top + window.scrollY - gap, behavior: 'smooth' });
    setTimeout(function () {
      map.invalidateSize();
      if (!state.sel) map.fitBounds(state.gu === 'all' ? cityBounds : guBounds[state.gu], { padding: [24, 24] });
    }, 450);
  }
  (function initLanding() {
    var cnt = { all: PLACES.length, box: 0, health: 0, pharmacy: 0 }, guCnt = {};
    PLACES.forEach(function (p) { cnt[p.kind]++; guCnt[p.gu] = (guCnt[p.gu] || 0) + 1; });
    document.querySelectorAll('[data-stat]').forEach(function (el) { el.textContent = cnt[el.dataset.stat]; });
    $('#heroBars').innerHTML = GU.map(function (g) {
      return '<li><button type="button" data-gu="' + g.key + '" style="--c:' + g.color + '">' +
        '<b>' + g.key + '</b><span>' + (guCnt[g.key] || 0) + '</span><small>수거처</small></button></li>';
    }).join('');
    $('#heroDate').textContent = META.boxDate ? META.boxDate.replace(/-/g, '.') : '-';

    $('#heroBars').addEventListener('click', function (e) {
      var b = e.target.closest('[data-gu]');
      if (!b) return;
      goFinder();
      setTimeout(function () { setGu(b.dataset.gu); }, 350);
    });
    $('#heroSearch').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#heroQ').value.trim();
      var input = $('#q');
      input.value = v;
      input.dispatchEvent(new Event('input'));
      goFinder();
      if (isMobile() && v) app.dataset.view = 'list';
      $('#heroQ').blur();
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]');
      if (!b || app.contains(b)) return;
      var go = b.dataset.go;
      goFinder();
      if (go === 'near') {
        if (!state.near) $('#nearBtn').click();
        if (isMobile()) app.dataset.view = 'list';
      } else if (go !== 'map') {
        var tab = document.querySelector('#tabs [data-kind="' + go + '"]');
        if (tab) tab.click();
      }
    });

    // 모바일: 지도 영역이 보일 때만 '목록 보기' 버튼 표시
    // 히어로를 지나고 지도가 화면에 없을 때 '수거처 찾기' 버튼 표시
    var heroOut = false, appIn = false;
    function syncFloat() { document.body.classList.toggle('show-float', !appIn); }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          document.body.classList.toggle('in-finder', en.intersectionRatio > 0.6);
          appIn = en.intersectionRatio > 0.15;
          syncFloat();
        });
      }, { threshold: [0, 0.15, 0.6, 1] }).observe(app);
      new IntersectionObserver(function (es) {
        es.forEach(function (en) { heroOut = !en.isIntersecting; syncFloat(); });
      }).observe(document.querySelector('.hero'));
    } else {
      document.body.classList.add('in-finder');
    }
    $('#floatCta').addEventListener('click', function (e) { e.preventDefault(); goFinder(); });
    $('#heroMap').addEventListener('click', function (e) { e.preventDefault(); goFinder(); });

  })();

  /* ===== 시작 ===== */
  // ?type=pharmacy&gu=영통구 처럼 링크로 초기 조건 지정 (포스터 QR용)
  var qs = new URLSearchParams(location.search);
  if (KIND_LABEL[qs.get('type')]) state.kind = qs.get('type');
  if (GU_COLOR[qs.get('gu')]) state.gu = qs.get('gu');
  if (qs.get('q')) { state.q = qs.get('q'); $('#q').value = state.q; $('#qClear').hidden = false; }

  renderAll();
  if (state.gu !== 'all' && guBounds[state.gu]) map.fitBounds(guBounds[state.gu], { padding: [24, 24] });

  var h = location.hash.match(/p=(\d+)/);
  if (h) setTimeout(function () { goFinder(); select(Number(h[1])); }, 50);
  else if (qs.get('type') || qs.get('gu') || qs.get('q')) setTimeout(goFinder, 50);
  window.addEventListener('resize', function () { map.invalidateSize(); });
})();
