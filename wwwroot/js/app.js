(function () {
    'use strict';

    var API = 'api/';
    var $ = function (id) { return document.getElementById(id); };

    var ddlTable = $('ddlTable'), txtProduct = $('txtProduct'), list = $('suggestions'),
        acBox = $('acBox'), statusEl = $('status'), card = $('productCard'),
        preview = $('preview'), pvTitle = $('pvTitle'), pvOpen = $('pvOpen'),
        addUrl = $('addUrl'), txtNewUrl = $('txtNewUrl'), btnSave = $('btnSave'),
        btnCopy = $('btnCopy'), fUrl = $('fUrl');

    var timer = null, seq = 0, active = -1, items = [], current = null;

    var ICON_DOC = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>';
    var ICON_LINK = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';

    function qs(o) {
        return Object.keys(o).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]);
        }).join('&');
    }

    function setStatus(msg, cls) {
        statusEl.textContent = msg || '';
        statusEl.className = 'status' + (cls ? ' ' + cls : '');
    }

    function get(path, params) {
        return fetch(API + path + '?' + qs(params), { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    }

    function post(path, body) {
        return fetch(API + path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }

    function hideList() { list.style.display = 'none'; list.innerHTML = ''; items = []; active = -1; }

    // ---------- URL helpers ----------
    // new URL() copes with spaces and other characters in the saved text
    // (e.g. "MAC131 -Maargun Leaflet.pdf") by percent-encoding them.
    function parseUrl(raw) {
        try {
            var u = new URL((raw || '').trim());
            if (u.protocol === 'http:' || u.protocol === 'https:') return u;
        } catch (e) { /* not a URL */ }
        return null;
    }
    function isImage(u) { return /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(u.pathname); }
    function isPdf(u) { return /\.pdf$/i.test(u.pathname); }

    // ---------- preview panel (right side) ----------
    function showPlaceholder(icon, title, text) {
        pvTitle.textContent = 'Preview';
        pvOpen.style.display = 'none';
        pvOpen.removeAttribute('href');
        preview.innerHTML = '';
        var box = document.createElement('div');
        box.className = 'pv-empty';
        var circle = document.createElement('div');
        circle.className = 'circle';
        circle.innerHTML = icon;
        var h = document.createElement('h3');
        h.textContent = title;
        var p = document.createElement('p');
        p.textContent = text;
        box.appendChild(circle);
        box.appendChild(h);
        box.appendChild(p);
        preview.appendChild(box);
    }

    function placeholderStart() {
        showPlaceholder(ICON_DOC, 'Nothing to preview yet',
            'Select a table, search for a product and its document will appear here.');
    }

    function clearProduct() {
        card.style.display = 'none';
        current = null;
        placeholderStart();
    }

    function renderPreview(url) {
        txtNewUrl.value = '';

        if (!url) {
            addUrl.style.display = 'block';
            showPlaceholder(ICON_LINK, 'No URL saved yet',
                'Add a URL on the left and the preview will appear here.');
            return;
        }
        addUrl.style.display = 'none';

        var u = parseUrl(url);
        if (!u) {
            showPlaceholder(ICON_LINK, 'Cannot preview this link',
                'The saved value is not a valid http(s) link.');
            return;
        }

        var kind = isImage(u) ? 'Image' : (isPdf(u) ? 'PDF document' : 'Web page');
        pvTitle.textContent = 'Preview - ' + kind;
        pvOpen.href = u.href;
        pvOpen.style.display = '';

        preview.innerHTML = '';
        if (isImage(u)) {
            var img = document.createElement('img');
            img.alt = 'Preview';
            img.onerror = function () {
                showPlaceholder(ICON_LINK, 'Could not load the image', 'Use "Open in new tab" to view it.');
                pvTitle.textContent = 'Preview - Image';
                pvOpen.href = u.href;
                pvOpen.style.display = '';
            };
            img.src = u.href;
            preview.appendChild(img);
        } else {
            var f = document.createElement('iframe');
            f.setAttribute('referrerpolicy', 'no-referrer');
            f.title = 'Preview';
            f.src = (isPdf(u) && !u.hash) ? u.href + '#view=FitH' : u.href;
            preview.appendChild(f);
        }
    }

    // ---------- table dropdown ----------
    ddlTable.addEventListener('change', function () {
        txtProduct.value = '';
        hideList();
        setStatus('');
        clearProduct();
        if (ddlTable.value) {
            txtProduct.disabled = false;
            txtProduct.placeholder = 'Type 2+ characters of the product name...';
            txtProduct.focus();
        } else {
            txtProduct.disabled = true;
            txtProduct.placeholder = 'Select a table first...';
        }
    });

    // ---------- autocomplete ----------
    txtProduct.addEventListener('input', function () {
        clearProduct();
        setStatus('');
        clearTimeout(timer);
        var term = txtProduct.value.trim();
        if (term.length < 2) { hideList(); acBox.classList.remove('loading'); return; }
        timer = setTimeout(function () { runSearch(term); }, 250);
    });

    function runSearch(term) {
        var mine = ++seq;
        acBox.classList.add('loading');
        get('search', { table: ddlTable.value, q: term }).then(function (res) {
            if (mine !== seq) return; // a newer search is in flight
            acBox.classList.remove('loading');
            if (!res.ok) { hideList(); setStatus(res.message || 'Search failed.', 'err'); return; }
            renderList(res.items || [], term);
        }).catch(function () {
            if (mine !== seq) return;
            acBox.classList.remove('loading');
            setStatus('Could not reach the server.', 'err');
        });
    }

    function appendHighlighted(el, text, term) {
        var i = text.toLowerCase().indexOf(term.toLowerCase());
        if (i < 0) { el.appendChild(document.createTextNode(text)); return; }
        el.appendChild(document.createTextNode(text.substring(0, i)));
        var m = document.createElement('mark');
        m.textContent = text.substring(i, i + term.length);
        el.appendChild(m);
        el.appendChild(document.createTextNode(text.substring(i + term.length)));
    }

    function renderList(data, term) {
        list.innerHTML = '';
        items = data;
        active = -1;
        if (!data.length) {
            var none = document.createElement('div');
            none.className = 'empty';
            none.textContent = 'No matching products.';
            list.appendChild(none);
        } else {
            data.forEach(function (it, i) {
                var row = document.createElement('div');
                row.className = 'item';
                var name = document.createElement('span');
                name.className = 'name';
                appendHighlighted(name, it.name || '(no name)', term);
                row.appendChild(name);
                if (it.client) {
                    var c = document.createElement('span');
                    c.className = 'client';
                    c.textContent = it.client;
                    row.appendChild(c);
                }
                row.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i); });
                list.appendChild(row);
            });
        }
        list.style.display = 'block';
    }

    function highlight() {
        var rows = list.querySelectorAll('.item');
        for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('active', i === active);
        if (rows[active]) rows[active].scrollIntoView({ block: 'nearest' });
    }

    txtProduct.addEventListener('keydown', function (e) {
        if (list.style.display === 'none' || !items.length) return;
        if (e.key === 'ArrowDown') { active = (active + 1) % items.length; highlight(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; highlight(); e.preventDefault(); }
        else if (e.key === 'Enter') { if (active >= 0) { choose(active); e.preventDefault(); } }
        else if (e.key === 'Escape') { hideList(); }
    });

    txtProduct.addEventListener('blur', function () { setTimeout(hideList, 150); });

    function choose(i) {
        var it = items[i];
        if (!it) return;
        txtProduct.value = it.name || '';
        hideList();
        setStatus('Loading...', 'info');
        get('product', { table: ddlTable.value, pk: it.pk }).then(function (res) {
            if (!res.ok) { setStatus(res.message || 'Could not load product.', 'err'); return; }
            setStatus('');
            showProduct(res.item);
        }).catch(function () { setStatus('Could not reach the server.', 'err'); });
    }

    // ---------- product ----------
    function setUrlRow(url) {
        if (url) {
            fUrl.textContent = url;
            fUrl.classList.remove('empty');
        } else {
            fUrl.textContent = 'No URL saved';
            fUrl.classList.add('empty');
        }
        btnCopy.style.display = url ? '' : 'none';
    }

    function showProduct(p) {
        current = p;
        $('fName').textContent = p.name || '-';
        $('fSku').textContent = p.sku || '-';
        card.style.display = 'block';
        setUrlRow(p.url);
        renderPreview(p.url);
    }

    btnCopy.addEventListener('click', function () {
        if (!current || !current.url) return;
        var done = function () {
            btnCopy.textContent = 'Copied';
            setTimeout(function () { btnCopy.textContent = 'Copy'; }, 1200);
        };
        if (navigator.clipboard) { navigator.clipboard.writeText(current.url).then(done); }
    });

    // ---------- save URL ----------
    btnSave.addEventListener('click', saveUrl);
    txtNewUrl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveUrl(); } });

    function saveUrl() {
        if (!current) return;
        var url = txtNewUrl.value.trim();
        if (!/^https?:\/\//i.test(url) || !parseUrl(url)) {
            setStatus('Enter a valid URL starting with http:// or https://', 'err');
            return;
        }

        btnSave.disabled = true;
        setStatus('Saving...', 'info');
        post('saveurl', { table: ddlTable.value, pk: current.pk, url: url }).then(function (res) {
            btnSave.disabled = false;
            if (!res.ok) { setStatus(res.message || 'Save failed.', 'err'); return; }
            current.url = url;
            setUrlRow(url);
            setStatus('URL saved.', 'ok');
            renderPreview(url);
        }).catch(function () {
            btnSave.disabled = false;
            setStatus('Could not reach the server.', 'err');
        });
    }

    placeholderStart();
})();
