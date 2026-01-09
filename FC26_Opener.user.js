// ==UserScript==
// @name         FC 26 PRO Pack Opener (V4.6)
// @namespace    http://tampermonkey.net/
// @version      4.6
// @description  V4.5 + Fix UI + ShowReport Restored. Ligas HTML, Modo Coleccionista, Anti-Bucle y Detector Picks.
// @author       Javier
// @match        https://www.ea.com/*
// @match        https://www.ea.com/ea-sports-fc/ultimate-team/web-app/*
// @include      https://www.ea.com/*
// @include      https://*.ea.com/*
// @include      https://www.ea.com/*/ea-sports-fc/ultimate-team/web-app/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (window.location.href.indexOf('/ultimate-team/web-app') === -1) return;

    console.log("🚀 FC 26 PRO V4.6 (UI FIXED & REPORT RESTORED) CARGADO");

    const API_BASE = "https://utas.mob.v5.prd.futc-ext.gcp.ea.com/ut/game/fc26";
    let SESSION_TOKEN = null;
    let CURRENT_SPEED = 'slow';

    // --- 📚 BASE DE DATOS MAESTRA (Nombres Oficiales) ---
    const ALL_LEAGUES = {
        13: "Premier League (ENG 1)",
        14: "EFL Championship (ENG 2)",
        16: "Ligue 1 McDonald's (FRA 1)",
        17: "Ligue 2 BKT (FRA 2)",
        31: "Serie A Enilive (ITA 1)",
        32: "Serie BKT (ITA 2)",
        19: "Bundesliga (GER 1)",
        20: "Bundesliga 2 (GER 2)",
        53: "LALIGA EA SPORTS (ESP 1)",
        54: "LALIGA HYPERMOTION (ESP 2)",
        4:  "1A Pro League (BEL 1)",
        10: "Eredivisie (NED 1)",
        238: "Liga Portugal (POR 1)",
        39: "MLS (MLS)",
        350: "ROSHN Saudi League (SAU 1)",
        330: "SUPERLIGA (ROM 1)",

        // Soporte
        50: "Scottish Premiership (SCO)",
        60: "EFL League One (ENG 3)",
        61: "EFL League Two (ENG 4)",
        2076: "3. Liga (GER 3)",
        68: "Trendyol Süper Lig (TUR)",
        80: "Ö. Bundesliga (AUT)",
        1: "3F Superliga (DEN)",
        41: "Eliteserien (NOR)",
        56: "Allsvenskan (SWE)",
        189: "Super League (SUI)",
        66: "Ekstraklasa (POL)",
        317: "Czech First League (CZE)",
        1003: "UPL (UKR)",
        65: "SSE Airtricity PD (IRL)",
        308: "Liga Profesional (ARG)",
        253: "CONMEBOL Libertadores",
        254: "CONMEBOL Sudamericana",
        83: "K League 1 (KOR)",
        2012: "CSL (CHN)",
        351: "A-League (AUS)",
        2149: "Indian Super League (IND)"
    };

    let CONFIG = {
        rules: {
            special: { new: 'club', dupeIntrans: 'storage', dupeTrans: 'trade' },
            gold:    { new: 'club', dupeIntrans: 'storage', dupeTrans: 'trade', minRatingSell: 83 },
            silver:  { new: 'club', dupeIntrans: 'storage', dupeTrans: 'trade' },
            bronze:  { new: 'club', dupeIntrans: 'storage', dupeTrans: 'trade' }
        },
        leagues: [13, 14, 16, 17, 31, 32, 19, 20, 53, 54, 4, 10, 238, 39, 350, 330],
        checkLeagues: true,
        soundEnabled: true,
        saveGolds: false
    };

    function loadConfig() {
        const saved = localStorage.getItem('fc26_pro_config_v4_6');
        if (saved) { try { CONFIG = { ...CONFIG, ...JSON.parse(saved) }; } catch(e) {} }
    }
    function saveConfig() { localStorage.setItem('fc26_pro_config_v4_6', JSON.stringify(CONFIG)); }
    loadConfig();

    let SESSION_DATA = { items: [], stats: { rating: {}, totw: 0, special: 0, walkout: 0 }, totalOpened: 0, coins: 0 };

    const SOUNDS = {
        walkout: () => {
            if(!CONFIG.soundEnabled) return;
            try {
                const audio = new AudioContext(); const now = audio.currentTime;
                [{f:523.25,s:0}, {f:659.25,s:0.15}, {f:783.99,s:0.3}, {f:1046.5,s:0.45}].forEach(n => {
                    const o=audio.createOscillator(), g=audio.createGain(); o.connect(g); g.connect(audio.destination);
                    o.type='triangle'; o.frequency.value=n.f; g.gain.setValueAtTime(0.1, now+n.s);
                    g.gain.exponentialRampToValueAtTime(0.0001, now+n.s+0.15); o.start(now+n.s); o.stop(now+n.s+0.15);
                });
            } catch(e) {}
        },
        complete: () => {
            if(!CONFIG.soundEnabled) return;
            try {
                const audio = new AudioContext(); const now = audio.currentTime;
                [{f:880,s:0}, {f:1108,s:0.15}].forEach(n => {
                    const o=audio.createOscillator(), g=audio.createGain(); o.connect(g); g.connect(audio.destination);
                    o.frequency.value=n.f; g.gain.setValueAtTime(0.05, now+n.s); g.gain.exponentialRampToValueAtTime(0.0001, now+n.s+0.3); o.start(now+n.s); o.stop(now+n.s+0.3);
                });
            } catch(e) {}
        }
    };

    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(key, value) {
        if (key && key.toLowerCase() === 'x-ut-sid') { SESSION_TOKEN = value; updateStatusUI(); }
        return originalSetRequestHeader.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = new Proxy(originalFetch, {
        apply: function(target, thisArg, argumentsList) {
            const [url, config] = argumentsList;
            if (config && config.headers) {
                if (config.headers instanceof Headers) {
                    config.headers.forEach((v, k) => { if (k.toLowerCase() === 'x-ut-sid') { SESSION_TOKEN = v; updateStatusUI(); } });
                } else {
                    for (let h in config.headers) { if (h.toLowerCase() === 'x-ut-sid') { SESSION_TOKEN = config.headers[h]; updateStatusUI(); } }
                }
            }
            return target.apply(thisArg, argumentsList);
        }
    });

    const EA_API = {
        async request(endpoint, method, body = null) {
            if (!SESSION_TOKEN) throw new Error("NO_TOKEN");
            const speedDelays = { fast: { min: 100, max: 200 }, medium: { min: 200, max: 350 }, slow: { min: 350, max: 600 } };
            const delays = speedDelays[CURRENT_SPEED || 'slow'];
            await new Promise(r => setTimeout(r, Math.random() * (delays.max - delays.min) + delays.min));

            let fullUrl = `${API_BASE}${endpoint}`;
            if (method === "DELETE" && body && body.itemIds) { fullUrl += `?itemIds=${body.itemIds.join(',')}`; body = null; }

            const response = await originalFetch(fullUrl, { method: method, headers: { "X-Ut-Sid": SESSION_TOKEN, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : null });

            if (!response.ok) {
                const text = await response.text();
                if (response.status === 404) throw new Error("PACK_NOT_FOUND");
                if (response.status === 471) throw new Error("UNASSIGNED_ERROR");
                if (response.status === 460) throw new Error("INVALID_PACK_TYPE");
                if (response.status === 409 || text.includes("SBC_STORAGE_FULL")) throw new Error("STORAGE_FULL");

                if (response.status === 400) {
                    if (endpoint.includes("/item/") && method === "POST") {
                        console.warn("⚠️ Error 400 en canje (ignorado, posible auto-canje)");
                        throw new Error("REDEEM_FAILED");
                    }
                    if (endpoint.includes("/purchased/items")) {
                        throw new Error("BAD_REQUEST_OPENING");
                    }
                    throw new Error("BAD_REQUEST");
                }

                if (response.status === 401) return {};
                throw new Error(`API Error ${response.status}`);
            }
            return response.json();
        },
        async openStoredPack(packId, isTradeable) { return this.request("/purchased/items", "POST", { packId: parseInt(packId), untradeable: !isTradeable, usePreOrder: true }); },

        async moveItems(itemsArray) {
            if (!itemsArray || itemsArray.length === 0) return;
            const CHUNK_SIZE = 50;
            for (let i = 0; i < itemsArray.length; i += CHUNK_SIZE) {
                const chunk = itemsArray.slice(i, i + CHUNK_SIZE);
                try {
                    await this.request("/item", "PUT", { itemData: chunk });
                } catch(e) {
                    console.warn("Fallo lote, intentando fallback...", e);
                    for (const item of chunk) {
                        try {
                            await this.request("/item", "PUT", { itemData: [item] });
                        } catch(ee) {
                            if (item.pile === 'club') {
                                try { await this.request("/item", "PUT", { itemData: [{id: item.id, pile: 'storage'}] }); } catch (eee) {}
                            }
                        }
                    }
                }
            }
        },

        async discardItems(itemsIdsArray) {
            if (!itemsIdsArray || itemsIdsArray.length === 0) return;
            const CHUNK_SIZE = 40;
            for (let i = 0; i < itemsIdsArray.length; i += CHUNK_SIZE) {
                const chunk = itemsIdsArray.slice(i, i + CHUNK_SIZE);
                try {
                    await this.request("/item", "DELETE", { itemIds: chunk });
                } catch(e) {
                    for (const id of chunk) { try { await this.request("/item", "DELETE", { itemIds: [id] }); } catch(ee) {} }
                }
            }
        },

        async redeemSpecificItem(itemId) { return this.request(`/item/${itemId}`, "POST", { itemData: [] }); },
        async updateCredits() { try { return await this.request("/user/credits", "GET"); } catch(e) {} },
        async refreshStore() { try { await this.request("/store/purchaseGroup/all?ppInfo=true&categoryInfo=true", "GET"); return true; } catch(e) { return false; } }
    };

    // --- CEREBRO ---
    function getCardCategory(item) {
        const rare = item.rareflag || 0; const rating = item.rating || 0;
        const specialRareFlags = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 23, 24, 32, 33, 34, 35, 36, 37, 38, 39, 40, 50, 51, 52, 53, 54, 55];
        if (specialRareFlags.includes(rare)) return 'special';
        if (rating >= 75) return 'gold';
        if (rating >= 65) return 'silver';
        return 'bronze';
    }

    function analyzeItem(item, isRealDuplicate) {
        const type = (item.itemType || item.type || '').toLowerCase();

        // 0. STOP PICK
        const isPlayerPick = (
            type.includes('pick') || type.includes('choice') ||
            item.cardsubtypeid === 20 || item.cardsubtypeid === 203 || item.cardsubtypeid === 204
        );
        if (isPlayerPick) return 'STOP_PICK';

        // 1. REDEEM
        const isRedeemable = (
            type === 'misc' || type === 'currency' || type === 'draft_token' ||
            type === 'coin' || type === 'pack' || (item.value > 0 && !item.rating)
        );
        if (isRedeemable) {
            console.log(`💎 Canjeable: ${type}, ID: ${item.id}, Valor: ${item.value || item.amount}`);
            return 'REDEEM';
        }

        const isTradeable = !item.untradeable;
        const isDupe = isRealDuplicate || item.isDuplicate || (item.itemState === "duplicate");

        // 2. NO JUGADORES (Collector Mode)
        if (type !== 'player') {
            const isJunk = ['kit', 'badge', 'stadium', 'ball', 'tifo', 'celebration', 'manager', 'staff'].some(c => type.includes(c));

            if (isJunk) {
                if (isTradeable) return 'QUICK_SELL';
                if (isDupe) return 'QUICK_SELL_0';
                return 'TO_CLUB'; // Guardar basura nueva intransferible
            }
            return isTradeable ? 'QUICK_SELL' : 'TO_CLUB'; // Recursos
        }

        // 3. JUGADORES
        const rating = item.rating || 0;
        const category = getCardCategory(item);

        // Stats
        if (!SESSION_DATA.stats.rating[rating]) SESSION_DATA.stats.rating[rating] = 0;
        SESSION_DATA.stats.rating[rating]++;
        if (category === 'special') SESSION_DATA.stats.special++;
        if (rating >= 86) SESSION_DATA.stats.walkout++;

        if ((category === 'special' || rating >= 86) && !isDupe && CONFIG.soundEnabled) {
            SOUNDS.walkout();
        }

        // A. ESPECIALES
        if (category === 'special') {
            const rules = CONFIG.rules.special;
            if (isTradeable) return 'TO_TRANSFER_LIST';
            return isDupe ? `TO_${rules.dupeIntrans.toUpperCase()}` : `TO_${rules.new.toUpperCase()}`;
        }

        // B. ORO
        else if (category === 'gold') {
            const rules = CONFIG.rules.gold;
            const isHighRated = rating >= rules.minRatingSell;
            const isImportantLeague = CONFIG.checkLeagues ? CONFIG.leagues.includes(item.leagueId) : true;

            if (isTradeable && rating >= 84) return 'TO_TRANSFER_LIST';

            if (isDupe) {
                if (!isTradeable) return 'TO_SBC_STORAGE';
                else return isHighRated ? 'TO_TRANSFER_LIST' : 'QUICK_SELL';
            }
            else {
                if (!isTradeable || isHighRated || isImportantLeague) return 'TO_CLUB';
                if (CONFIG.saveGolds) return 'TO_CLUB'; // Hoarder Mode
                return 'QUICK_SELL';
            }
        }

        // C. PLATA/BRONCE
        else {
            if (!isTradeable) return isDupe ? 'TO_SBC_STORAGE' : 'TO_CLUB';
            else if (CONFIG.checkLeagues && CONFIG.leagues.includes(item.leagueId)) return isDupe ? 'QUICK_SELL' : 'TO_CLUB';
            else return 'QUICK_SELL';
        }
    }

    async function startEngine(packId, config) {
        const total = parseInt(config.qty); CURRENT_SPEED = config.speed;
        SESSION_DATA = { items: [], stats: { rating: {}, totw: 0, special: 0, walkout: 0 }, totalOpened: 0, coins: 0 };

        showLoadingOverlay();

        for (let i = 0; i < total; i++) {
            console.log(`📦 Abriendo sobre ${i+1}/${total}`);

            try {
                updateLoadingMsg(`ABRIENDO SOBRE ${i+1}/${total}...`, {current: i+1, total: total});

                let data = await EA_API.openStoredPack(packId, config.isTradeable);
                let items = data.itemList || data.items || [];
                SESSION_DATA.totalOpened++;

                if (!items.length) continue;

                const duplicateSet = new Set();
                if (data.duplicateItemIdList) data.duplicateItemIdList.forEach(d => duplicateSet.add(d.itemId));

                let moveQueue = [], discardQueue = [], redeemQueue = [];
                let stopExecution = false;

                // ANALIZAR
                for (const item of items) {
                    const isRealDupe = duplicateSet.has(item.id);
                    const action = analyzeItem(item, isRealDupe);
                    const cat = (item.itemType === 'player' || item.type === 'player') ? getCardCategory(item) : 'other';

                    if (action === 'STOP_PICK') { stopExecution = true; break; }

                    if (action === 'REDEEM') {
                        const itemValue = item.amount || item.value || 0;
                        redeemQueue.push({ id: item.id, value: itemValue, type: item.itemType || item.type });
                    }
                    else if (action.includes('QUICK_SELL')) {
                        discardQueue.push(item.id);
                        if (action === 'QUICK_SELL') { SESSION_DATA.coins += (item.discardValue || 0); updateCoinDisplay(); }
                    }
                    else if (action === 'TO_CLUB') moveQueue.push({ id: item.id, pile: "club" });
                    else if (action === 'TO_TRANSFER_LIST') moveQueue.push({ id: item.id, pile: "trade" });
                    else if (action === 'TO_SBC_STORAGE') moveQueue.push({ id: item.id, pile: "storage" });
                    else if (!action) moveQueue.push({ id: item.id, pile: "club" }); // Fallback

                    SESSION_DATA.items.push({ id: item.id, pack: i + 1, assetId: item.assetId, rating: item.rating||0, action: action||'TO_CLUB', type: cat, status: "PENDIENTE", isPlayer: (item.itemType === 'player') });
                }

                if (stopExecution) {
                    hideLoadingOverlay();
                    alert("⚠️ PLAYER PICK DETECTADO.\n\nEl script se ha detenido. Elige tu jugador.");
                    break;
                }

                console.log(`📊 Análisis: ${redeemQueue.length} canjeables, ${moveQueue.length} a mover, ${discardQueue.length} a vender`);

                // 1. CANJEAR
                if (redeemQueue.length > 0) {
                    updateLoadingMsg(`CANJEANDO ${redeemQueue.length} ITEMS...`);
                    for (const redeemItem of redeemQueue) {
                        try {
                            await EA_API.redeemSpecificItem(redeemItem.id);
                            SESSION_DATA.coins += redeemItem.value;
                            updateCoinDisplay();
                            confirmStatus([redeemItem.id], "CANJEADO ($)");
                        }
                        catch (e) {
                            if(e.message === "REDEEM_FAILED") {
                                console.log(`✅ Auto-canjeado: ${redeemItem.type}`);
                                confirmStatus([redeemItem.id], "CANJEADO (Auto)");
                            } else {
                                console.warn("Error real canje:", e);
                                confirmStatus([redeemItem.id], "ERROR CANJE");
                            }
                        }
                    }
                    await EA_API.updateCredits();
                    await new Promise(r => setTimeout(r, 800));
                }

                // 2. MOVER
                if (moveQueue.length > 0) {
                    updateLoadingMsg(`GUARDANDO ${moveQueue.length} ITEMS...`);
                    await EA_API.moveItems(moveQueue);
                    confirmStatus(moveQueue.map(i => i.id), "MOVIDO OK");
                }

                // 3. VENDER
                if (discardQueue.length > 0) {
                    updateLoadingMsg(`VENDIENDO ${discardQueue.length} ITEMS...`);
                    await EA_API.discardItems(discardQueue);
                    confirmStatus(discardQueue, "VENDIDO");
                }

                await new Promise(r => setTimeout(r, config.speed === 'fast' ? 500 : 1500));

            } catch (error) {
                console.error("⛔ ERROR EN SOBRE:", error);

                const isCritical = ['PACK_NOT_FOUND', 'UNASSIGNED_ERROR', 'STORAGE_FULL', 'NO_TOKEN', 'INVALID_PACK_TYPE', 'BAD_REQUEST_OPENING'].some(e => error.message.includes(e));

                if (isCritical) {
                    hideLoadingOverlay();
                    let msg = `❌ ERROR CRÍTICO: ${error.message}`;
                    if (error.message.includes("471")) msg = "❌ ERROR 471: Tienes items sin asignar. Limpia y reinicia.";
                    if (error.message.includes("BAD_REQUEST_OPENING")) msg = "❌ ERROR 400: Posible Player Pick. Revisa manualmente.";
                    alert(msg);
                    break;
                }

                console.warn(`⚠️ Error no crítico en sobre ${i+1}, continuando...`);
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        updateLoadingMsg("ACTUALIZANDO TIENDA...");
        await EA_API.refreshStore();

        try {
            const tabs = document.querySelectorAll('.ut-tab-bar-item');
            let clubBtn, storeBtn;
            tabs.forEach(t => {
                if(t.innerText.includes('Club')) clubBtn = t;
                if(t.innerText.includes('Tienda') || t.innerText.includes('Store')) storeBtn = t;
            });
            if(clubBtn && storeBtn) {
                clubBtn.click();
                await new Promise(r => setTimeout(r, 500));
                storeBtn.click();
            }
        } catch(e) {}

        hideLoadingOverlay();
        if(CONFIG.soundEnabled) SOUNDS.complete();

        // FIX V4.6: Llamada segura al reporte
        if (config.showReport && typeof showReport === 'function') showReport();
        else alert("✅ Finalizado");
    }

    function confirmStatus(ids, statusMsg) { ids.forEach(targetId => { let log = SESSION_DATA.items.find(x => x.id === targetId); if(log) log.status = statusMsg; }); }
    function getLeagueName(id) { return ALL_LEAGUES[id] || `Liga ${id}`; }
    function getImageUrl(assetId) { return `https://www.ea.com/ea-sports-fc/ultimate-team/web-app/content/26E4D4D6-8DBB-4A9A-BD99-9C47D3AA341D/2026/fut/items/images/mobile/portraits/${assetId}.png`; }
    function updateStatusUI() { const el = document.getElementById('token-status'); if(el && SESSION_TOKEN) { el.innerText = "CONECTADO"; el.style.color = "#00ff88"; } }
    function showLoadingOverlay() { if(document.getElementById('fc-loading-overlay')) return; const div = document.createElement('div'); div.id = "fc-loading-overlay"; div.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999999;display:flex;flex-direction:column;justify-content:center;align-items:center;color:#fff;font-family:sans-serif;"; div.innerHTML = `<div style="font-size:40px;">⚡</div><div id="fc-loading-text" style="font-size:18px;font-weight:bold;color:#00d2be;">INICIANDO...</div><div id="fc-coin-counter" style="margin-top:15px;font-size:14px;color:#f39c12;">💰 <span id="coin-amount">0</span> monedas</div>`; document.body.appendChild(div); }
    function updateLoadingMsg(msg, progress = null) { const el = document.getElementById('fc-loading-text'); if(!el) return; let html = `<div>${msg}</div>`; if (progress) { const pct = Math.min(100, Math.round(((progress.current) / progress.total) * 100)); html += `<div style="width:200px;height:6px;background:#333;margin-top:10px;border-radius:3px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:#00d2be;transition:width 0.3s;"></div></div><div style="font-size:12px;color:#aaa;margin-top:5px;">${progress.current}/${progress.total}</div>`; } el.innerHTML = html; }
    function updateCoinDisplay() { const el = document.getElementById('coin-amount'); if (el) el.textContent = SESSION_DATA.coins.toLocaleString(); }
    function hideLoadingOverlay() { const el = document.getElementById('fc-loading-overlay'); if(el) el.remove(); }
    function exportStats() { const csv = [['Pack', 'Rating', 'Tipo', 'Duplicado', 'Acción', 'Estado'].join(','), ...SESSION_DATA.items.map(i => [i.pack, i.rating, i.type, i.isDupe ? 'Sí' : 'No', i.action, i.status].join(','))].join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `FC26_Stats_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url); } window.exportStats = exportStats;

    function showConfigSettings() {
        const overlay = document.createElement('div'); overlay.id = "cfg-overlay"; overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:999999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(2px);";

        // Listener para cerrar con ESC
        document.addEventListener('keydown', function(e) { if(e.key === "Escape") overlay.remove(); }, {once:true});

        const mkSel = (cat, context, val) => { let options = []; if (context === 'new') options = [['club','Club'], ['trade','Transferible'], ['discard','Venta']]; else if (context === 'dupeTrans') options = [['trade','Transferible'], ['discard','Venta']]; else if (context === 'dupeIntrans') options = [['storage','SBC'], ['discard','Venta (0)']]; let html = `<select onchange="window.updateRule('${cat}','${context}',this.value)" style="background:#333;color:#fff;border:1px solid #555;padding:4px;width:100%;">`; options.forEach(opt => { html += `<option value="${opt[0]}" ${val === opt[0] ? 'selected' : ''}>${opt[1]}</option>`; }); return html + `</select>`; };
        const renderLeagues = () => CONFIG.leagues.map(id => `<span style="background:#00d2be;color:#000;padding:4px 8px;border-radius:4px;margin-right:5px;font-size:11px;display:inline-block;margin-bottom:5px;">${getLeagueName(id)} <b onclick="window.removeLeague(${id})" style="cursor:pointer;margin-left:5px;color:#c0392b;font-weight:bold;">✕</b></span>`).join('');
        let leagueOptions = `<option value="">-- Selecciona Liga --</option>`; Object.entries(ALL_LEAGUES).sort((a,b) => a[1].localeCompare(b[1])).forEach(([id, name]) => { leagueOptions += `<option value="${id}">${name}</option>`; });

        let html = `<div style="background:#181818;color:#fff;font-family:sans-serif;width:750px;padding:25px;border:1px solid #00d2be;border-radius:8px;max-height:95vh;overflow-y:auto;">
            <h3 style="color:#00d2be;border-bottom:1px solid #333;padding-bottom:10px;margin-top:0;">⚙️ CONFIGURACIÓN <span style="font-size:12px;color:#666;float:right">(ESC para salir)</span></h3>
            <div style="margin-bottom:20px;background:#222;padding:15px;border-radius:5px;border:1px solid #333;"><label style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;"><span style="font-weight:bold;color:#00d2be;">🔊 Efectos de Sonido</span><input type="checkbox" id="sound-toggle" ${CONFIG.soundEnabled ? 'checked' : ''} onchange="window.toggleSound(this.checked)" style="transform:scale(1.5);cursor:pointer;"></label></div>
            <div style="margin-bottom:20px;background:#222;padding:15px;border-radius:5px;border:1px solid #333;">
                <label style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;color:#f1c40f;">
                    <span style="font-weight:bold;">🛡️ Guardar Oros (Acumulador)</span>
                    <input type="checkbox" id="save-golds-toggle" ${CONFIG.saveGolds ? 'checked' : ''} onchange="window.toggleSaveGolds(this.checked)" style="transform:scale(1.5);cursor:pointer;">
                </label>
                <div style="font-size:11px;color:#aaa;margin-top:5px;">Guarda en Club oros malos transferibles nuevos (para SBCs).</div>
            </div>
            <div style="margin-bottom:20px;background:#222;padding:15px;border-radius:5px;border:1px solid #333;"><div style="font-weight:bold;margin-bottom:5px;color:#f39c12;">🏆 LIGAS IMPORTANTES</div><div id="league-list" style="margin-bottom:15px;padding:5px;background:#1a1a1a;border:1px solid #444;border-radius:4px;min-height:40px;">${renderLeagues()}</div><div style="display:flex;gap:10px;"><select id="league-selector" style="flex:1;padding:8px;background:#333;border:1px solid #555;color:#fff;">${leagueOptions}</select><button onclick="window.addLeague()" style="background:#00d2be;color:#000;border:none;padding:8px 15px;cursor:pointer;font-weight:bold;border-radius:3px;">AÑADIR</button></div></div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;"><tr style="color:#aaa;text-align:left;"><th style="padding:8px;">TIPO</th><th style="padding:8px;">NUEVO</th><th style="padding:8px;">REPE (INTRANS)</th><th style="padding:8px;">REPE (TRANS)</th></tr><tr style="border-bottom:1px solid #333;"><td style="padding:10px;color:#9b59b6;font-weight:bold;">ESPECIAL</td><td>${mkSel('special','new',CONFIG.rules.special.new)}</td><td>${mkSel('special','dupeIntrans',CONFIG.rules.special.dupeIntrans)}</td><td>${mkSel('special','dupeTrans',CONFIG.rules.special.dupeTrans)}</td></tr><tr style="border-bottom:1px solid #333;"><td style="padding:10px;color:#f1c40f;font-weight:bold;">ORO</td><td>${mkSel('gold','new',CONFIG.rules.gold.new)}</td><td>${mkSel('gold','dupeIntrans',CONFIG.rules.gold.dupeIntrans)}</td><td>${mkSel('gold','dupeTrans',CONFIG.rules.gold.dupeTrans)}<div style="margin-top:5px;font-size:10px;color:#aaa;">Vender < <input type="number" value="${CONFIG.rules.gold.minRatingSell}" style="width:30px;text-align:center;background:#333;border:none;color:#fff;" onchange="window.updateRule('gold','minRatingSell',this.value)"></div></td></tr></table>
            <button id="save-cfg" style="width:100%;padding:12px;background:#00d2be;border:none;font-weight:bold;cursor:pointer;font-size:14px;border-radius:4px;">GUARDAR CAMBIOS</button>
        </div>`;
        overlay.innerHTML = html; document.body.appendChild(overlay);
        window.updateRule = (cat, key, val) => { if(key === 'minRatingSell') val = parseInt(val); CONFIG.rules[cat][key] = val; };
        window.toggleSound = (enabled) => { CONFIG.soundEnabled = enabled; };
        window.toggleSaveGolds = (enabled) => { CONFIG.saveGolds = enabled; };
        window.addLeague = () => { const id = parseInt(document.getElementById('league-selector').value); if(id && !CONFIG.leagues.includes(id)) { CONFIG.leagues.push(id); document.getElementById('league-list').innerHTML = renderLeagues(); } else if (CONFIG.leagues.includes(id)) { alert('⚠️ Liga ya añadida'); }};
        window.removeLeague = (id) => { CONFIG.leagues = CONFIG.leagues.filter(l => l !== id); document.getElementById('league-list').innerHTML = renderLeagues(); };
        document.getElementById('save-cfg').onclick = () => { saveConfig(); overlay.remove(); alert('✅ Configuración guardada'); };
    }

    // --- FUNCIÓN RESTAURADA: showReport ---
    function showReport() {
        const highlightItems = SESSION_DATA.items.filter(i => i.isPlayer && (i.rating >= 84 || i.type === 'special')).sort((a,b) => b.rating - a.rating);
        let statsHtml = `<div id="tab-stats"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:15px;text-align:center;"><div class="stat-box" style="border:1px solid #00d2be;padding:5px;">${SESSION_DATA.totalOpened} <span style="font-size:10px">SOBRES</span></div><div class="stat-box" style="border:1px solid #f1c40f;padding:5px;">${SESSION_DATA.stats.walkout} <span style="font-size:10px">WALKOUT</span></div><div class="stat-box" style="border:1px solid #9b59b6;padding:5px;">${SESSION_DATA.stats.special} <span style="font-size:10px">ESPECIAL</span></div><div class="stat-box" style="border:1px solid #f39c12;padding:5px;color:#f39c12;font-weight:bold;">${SESSION_DATA.coins.toLocaleString()} <span style="font-size:10px;color:#aaa">GANANCIAS</span></div></div><div style="height:300px;overflow-y:auto;border:1px solid #333;padding:10px;"><table style="width:100%;font-size:12px;border-collapse:collapse;">`;
        const ratings = SESSION_DATA.stats.rating; const maxCount = Math.max(...Object.values(ratings), 1);
        Object.keys(ratings).sort((a,b)=>b-a).forEach(r => { if(r>0) { const count = ratings[r]; const width = (count / maxCount) * 100; const color = r >= 86 ? '#e67e22' : (r >= 83 ? '#f1c40f' : '#ddd'); statsHtml += `<tr style="border-bottom:1px solid #222;"><td style="width:30px;font-weight:bold;color:${color};padding:4px;">${r}</td><td style="padding:4px;"><div style="background:#333;width:100%;height:6px;border-radius:3px;overflow:hidden;"><div style="background:${color};width:${width}%;height:100%;"></div></div></td><td style="width:30px;text-align:right;color:#fff;">${count}</td></tr>`; }});
        statsHtml += `</table></div></div>`;
        let galleryHtml = `<div id="tab-gallery" style="display:none;max-height:60vh;overflow-y:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:5px;">`;
        highlightItems.forEach(i => { galleryHtml += `<div style="background:#222;border:1px solid #444;text-align:center;padding:2px;"><div style="font-size:10px;color:${i.type=='special'?'#9b59b6':'gold'}">${i.rating}</div><img src="${getImageUrl(i.assetId)}" style="width:40px;"><div style="font-size:9px;">${i.isDupe?'REP':'NEW'}</div></div>`; });
        galleryHtml += `</div>`;
        let logHtml = `<div id="tab-log" style="display:none;max-height:60vh;overflow-y:auto;"><table style="width:100%;font-size:11px;border-collapse:collapse;color:#ccc;"><tr><th style="text-align:left;padding:5px;">ITEM</th><th style="padding:5px;">ACCIÓN</th><th style="padding:5px;">ESTADO</th></tr>`;
        SESSION_DATA.items.forEach(i => { let color = i.action.includes('SELL') ? '#e74c3c' : (i.action.includes('SBC') ? '#f39c12' : '#2ecc71'); logHtml += `<tr style="border-bottom:1px solid #333;"><td style="padding:5px;display:flex;align-items:center;gap:10px;">${i.isPlayer ? `<img src="${getImageUrl(i.assetId)}" style="width:30px;height:30px;">` : '📦'}<div><div style="font-weight:bold;color:#fff;">${i.rating>0?i.rating:''}</div><div style="font-size:9px;color:#aaa;">ID:${i.assetId}</div></div></td><td style="padding:5px;color:${color};font-weight:bold;">${i.action.replace('TO_','').replace('QUICK_','')}</td><td style="padding:5px;">${i.status}</td></tr>`; });
        logHtml += `</table></div>`;
        let html = `<div style="padding:15px;background:#141414;color:#fff;font-family:sans-serif;width:550px;max-height:90vh;border:1px solid #00d2be;display:flex;flex-direction:column;"><div style="display:flex;gap:5px;margin-bottom:10px;"><button class="tab-btn active" onclick="switchTab('stats')">RESUMEN</button><button class="tab-btn" onclick="switchTab('gallery')">GALERÍA</button><button class="tab-btn" onclick="switchTab('log')">LOG DETALLADO</button></div><div style="flex:1;overflow:hidden;">${statsHtml}${galleryHtml}${logHtml}</div><div style="display:flex;gap:10px;margin-top:10px;"><button onclick="window.exportStats()" style="flex:1;padding:10px;background:#3498db;border:none;color:#fff;cursor:pointer;font-weight:bold;border-radius:4px;">📊 EXPORTAR</button><button id="close-report" style="flex:2;padding:10px;background:#e74c3c;border:none;color:#fff;cursor:pointer;font-weight:bold;border-radius:4px;">CERRAR</button></div></div><style>.tab-btn{flex:1;padding:8px;background:#222;border:1px solid #444;color:#aaa;cursor:pointer;font-weight:bold;}.tab-btn.active{background:#00d2be;color:#000;}</style>`;
        const overlay = document.createElement('div');
        overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:99999;display:flex;justify-content:center;align-items:center;";
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        document.addEventListener('keydown', function(e) { if(e.key === "Escape") overlay.remove(); }, {once:true});
        window.switchTab = (t) => { ['stats','gallery','log'].forEach(x => document.getElementById('tab-'+x).style.display = 'none'); document.getElementById('tab-'+t).style.display = t === 'gallery' ? 'grid' : 'block'; document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase().includes(t.substring(0,3)))); };
        document.getElementById('close-report').onclick = () => overlay.remove();
    }

    initUI();
})();
