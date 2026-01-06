// ==UserScript==
// @name         FC 26 PRO Pack Opener (V3.0)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Versión Maestra: Fix Monedas visual, Preferencia de Mercado para medias altas y Anti-Bucle perfecto.
// @author       Javier & The AI Team
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

    // 1. SEGURIDAD
    if (window.location.href.indexOf('/ultimate-team/web-app') === -1) return;

    console.log("🚀 FC 26 PRO V3.0 (FINAL BOSS) CARGADO");

    const API_BASE = "https://utas.mob.v5.prd.futc-ext.gcp.ea.com/ut/game/fc26";
    let SESSION_TOKEN = null;
    let CURRENT_SPEED = 'slow';

    // --- 📚 BASE DE DATOS MAESTRA ---
    const ALL_LEAGUES = {
        13: "Premier League (ENG 1)", 14: "EFL Championship (ENG 2)", 60: "EFL League One (ENG 3)", 61: "EFL League Two (ENG 4)", 50: "Scottish Premiership (SCO)",
        53: "LaLiga EA SPORTS (ESP 1)", 54: "LaLiga Hypermotion (ESP 2)",
        19: "Bundesliga (GER 1)", 20: "Bundesliga 2 (GER 2)", 2076: "3. Liga (GER 3)",
        31: "Serie A Enilive (ITA 1)", 32: "Serie BKT (ITA 2)",
        16: "Ligue 1 McDonald's (FRA 1)", 17: "Ligue 2 BKT (FRA 2)",
        10: "Eredivisie (NED)", 238: "Liga Portugal (POR)", 68: "Trendyol Süper Lig (TUR)", 4: "Pro League (BEL)",
        80: "Ö. Bundesliga (AUT)", 1: "3F Superliga (DEN)", 41: "Eliteserien (NOR)", 56: "Allsvenskan (SWE)", 189: "Super League (SUI)", 66: "Ekstraklasa (POL)", 330: "SuperLiga (ROM)", 317: "Czech First League (CZE)", 1003: "UPL (UKR)", 65: "SSE Airtricity PD (IRL)",
        39: "MLS (USA)", 308: "Liga Profesional (ARG)", 253: "CONMEBOL Libertadores", 254: "CONMEBOL Sudamericana",
        350: "ROSHN Saudi League (SAU)", 83: "K League 1 (KOR)", 2012: "CSL (CHN)", 351: "A-League (AUS)", 2149: "Indian Super League (IND)"
    };

    let CONFIG = {
        rules: {
            special: { new: 'club', dupeIntrans: 'storage', dupeTrans: 'trade' },
            gold:    { new: 'club', dupeIntrans: 'storage', dupeTrans: 'trade', minRatingSell: 83 },
            silver:  { new: 'club', dupeIntrans: 'storage', dupeTrans: 'trade' },
            bronze:  { new: 'club', dupeIntrans: 'storage', dupeTrans: 'trade' }
        },
        leagues: [13, 14, 53, 54, 19, 20, 31, 32, 16, 17, 10, 238, 39, 350, 330],
        checkLeagues: true,
        soundEnabled: true 
    };

    function loadConfig() {
        const saved = localStorage.getItem('fc26_pro_config_v3');
        if (saved) { try { CONFIG = { ...CONFIG, ...JSON.parse(saved) }; } catch(e) {} }
    }
    function saveConfig() { localStorage.setItem('fc26_pro_config_v3', JSON.stringify(CONFIG)); }
    loadConfig();

    let SESSION_DATA = { items: [], stats: { rating: {}, totw: 0, special: 0, walkout: 0 }, totalOpened: 0, coins: 0 };

    // --- SONIDOS ---
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

    // --- API & SNIFFER ---
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
        async request(endpoint, method, body = null, skipDelay = false) {
            if (!SESSION_TOKEN) throw new Error("NO_TOKEN");
            if (!skipDelay) {
                const speedDelays = { fast: { min: 100, max: 200 }, medium: { min: 200, max: 350 }, slow: { min: 350, max: 600 } };
                const delays = speedDelays[CURRENT_SPEED || 'slow'];
                await new Promise(r => setTimeout(r, Math.random() * (delays.max - delays.min) + delays.min));
            }
            
            let fullUrl = `${API_BASE}${endpoint}`;
            if (method === "DELETE" && body && body.itemIds) { fullUrl += `?itemIds=${body.itemIds.join(',')}`; body = null; }
            
            const response = await originalFetch(fullUrl, { method: method, headers: { "X-Ut-Sid": SESSION_TOKEN, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : null });
            if (!response.ok) {
                const text = await response.text();
                if (response.status === 404) throw new Error("PACK_NOT_FOUND");
                if (response.status === 471) throw new Error("UNASSIGNED_ERROR");
                if (response.status === 460) throw new Error("INVALID_PACK_TYPE");
                if (response.status === 401) return {};
                if (text.includes("SBC_STORAGE_FULL") || response.status === 409) throw new Error("STORAGE_FULL");
                throw new Error(`API Error ${response.status}`);
            }
            return response.json();
        },
        async openStoredPack(packId, isTradeable) { return this.request("/purchased/items", "POST", { packId: parseInt(packId), untradeable: !isTradeable, usePreOrder: true }); },
        async getUnassignedItems() { return this.request("/purchased/items", "GET", null, true); }, 
        
        async moveItems(itemsArray) {
            if (!itemsArray || itemsArray.length === 0) return;
            const CHUNK_SIZE = 50; 
            for (let i = 0; i < itemsArray.length; i += CHUNK_SIZE) {
                const chunk = itemsArray.slice(i, i + CHUNK_SIZE);
                try {
                    await this.request("/item", "PUT", { itemData: chunk });
                } catch(e) {
                    if (e.message.includes("STORAGE_FULL")) throw e;
                    for (const item of chunk) { try { await this.request("/item", "PUT", { itemData: [item] }); } catch(ee) {} }
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
        async refreshStore() { try { await this.request("/store/purchaseGroup/all?ppInfo=true&categoryInfo=true", "GET"); await this.request("/sku/FFA26STM/store/category", "GET"); return true; } catch(e) { return false; } }
    };

    // --- CEREBRO V3.0 (LÓGICA MAESTRA) ---
    function getCardType(item) {
        const rare = item.rareflag || 0;
        const specialRareFlags = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 23, 24, 32, 33, 34, 35, 36, 37, 38, 39, 40, 50, 51, 52, 53, 54, 55];
        
        if (specialRareFlags.includes(rare)) return 'special'; 
        
        const rating = item.rating || 0;
        if (rating >= 75) return 'gold'; 
        if (rating >= 65) return 'silver'; 
        return 'bronze';
    }

    function analyzeItem(item, isRealDuplicate) {
        const type = (item.itemType || item.type || '').toLowerCase();
        
        // 1. REDIMIBLES
        if (type === 'misc' || type === 'currency' || type === 'draft_token' || (item.value > 0 && !item.rating)) return 'REDEEM';

        const isTradeable = !item.untradeable;
        const isDupe = isRealDuplicate || item.isDuplicate || (item.itemState === "duplicate");

        // 2. NO JUGADORES
        if (type !== 'player') {
            const isJunk = ['kit', 'badge', 'stadium', 'ball', 'tifo', 'celebration', 'manager', 'staff'].some(c => type.includes(c));
            if (isJunk) return isTradeable ? 'QUICK_SELL' : 'QUICK_SELL_0';
            return isTradeable ? 'QUICK_SELL' : 'TO_CLUB'; // Contratos intransferibles -> Club
        }

        // 3. JUGADORES
        const rating = item.rating || 0;
        const category = getCardType(item);

        // Stats
        if (!SESSION_DATA.stats.rating[rating]) SESSION_DATA.stats.rating[rating] = 0;
        SESSION_DATA.stats.rating[rating]++;
        if (category === 'special') SESSION_DATA.stats.special++; 
        if (category === 'special' || rating >= 86) {
            SESSION_DATA.stats.walkout++;
            if (!isDupe && CONFIG.soundEnabled) SOUNDS.walkout();
        }

        // A. ESPECIALES
        if (category === 'special') { 
            const rules = CONFIG.rules.special; 
            if (isTradeable) return `TO_${rules.dupeTrans.toUpperCase()}`; 
            return isDupe ? `TO_${rules.dupeIntrans.toUpperCase()}` : `TO_${rules.new.toUpperCase()}`; 
        }

        // B. ORO
        if (category === 'gold') {
            const rules = CONFIG.rules.gold;
            const isHighRated = rating >= rules.minRatingSell; 
            const isImportantLeague = CONFIG.checkLeagues ? CONFIG.leagues.includes(item.leagueId) : true;

            // PREFERENCIA DE USUARIO: Transferible 84+ -> SIEMPRE A LISTA
            if (isTradeable && rating >= 84) return 'TO_TRANSFER_LIST';

            if (isDupe) {
                if (!isTradeable) return 'TO_SBC_STORAGE';
                return isHighRated ? 'TO_TRANSFER_LIST' : 'QUICK_SELL';
            }

            // Nuevo: Intransferible O Liga Top -> Club
            if (!isTradeable || isImportantLeague) return 'TO_CLUB';
            return 'QUICK_SELL'; // Liga mala y transferible <84
        }

        // C. PLATA/BRONCE (Fix Claude)
        if (!isTradeable) return isDupe ? 'TO_SBC_STORAGE' : 'TO_CLUB';
        
        // Transferible
        if (CONFIG.checkLeagues) { 
            const isImportant = CONFIG.leagues.includes(item.leagueId); 
            if (isImportant) {
                // Si es liga importante: Nuevo->Club, Dupe->Venta
                return isDupe ? 'QUICK_SELL' : 'TO_CLUB';
            }
        }
        return 'QUICK_SELL'; // Liga mala transferible
    }

    // --- MOTOR (V3.0 - FINAL BOSS) ---
    async function startEngine(packId, config) {
        const total = parseInt(config.qty); CURRENT_SPEED = config.speed;
        SESSION_DATA = { items: [], stats: { rating: {}, totw: 0, special: 0, walkout: 0 }, totalOpened: 0, coins: 0 };
        const packRetries = {}; 
        
        showLoadingOverlay();
        let consecutive471 = 0;

        for (let i = 0; i < total; i++) {
            const timeoutId = setTimeout(() => {
                console.error("⏱️ TIMEOUT CRÍTICO");
                alert("⚠️ Proceso congelado."); hideLoadingOverlay();
            }, 300000);

            try {
                updateLoadingMsg(`ABRIENDO SOBRE ${i+1}/${total}...`, {current: i+1, total: total});
                let data = null, items = [], isRecovery = false;

                try {
                    data = await EA_API.openStoredPack(packId, config.isTradeable);
                    items = data.itemList || data.items || [];
                    SESSION_DATA.totalOpened++; 
                    consecutive471 = 0; 
                } catch (e) {
                    if (e.message.includes("PACK_NOT_FOUND")) { alert("✅ Sobres terminados."); break; }
                    else if (e.message.includes("UNASSIGNED_ERROR")) {
                        consecutive471++; 
                        
                        packRetries[i] = (packRetries[i] || 0) + 1;
                        if (packRetries[i] > 2) {
                            console.warn("Saltando sobre atascado...");
                            SESSION_DATA.totalOpened++; 
                            continue; 
                        }

                        if (consecutive471 >= 5) { alert("⛔ ATASCO PERSISTENTE."); break; }
                        
                        updateLoadingMsg(`⚠️ LIMPIANDO ATASCO (${consecutive471})...`);
                        await new Promise(r => setTimeout(r, 3000));
                        data = await EA_API.getUnassignedItems(); 
                        items = data.itemList || data.items || [];
                        isRecovery = true; 
                        i--; 
                        if (!items.length) { await new Promise(r => setTimeout(r, 3000)); continue; }
                    }
                    else if (e.message.includes("460")) { alert("❌ Error Config."); break; }
                    else throw e;
                }
                
                if (!items.length && !isRecovery) continue;
                const duplicateSet = new Set(); if (data.duplicateItemIdList) data.duplicateItemIdList.forEach(d => duplicateSet.add(d.itemId));
                let moveQueue = [], discardQueue = [], redeemQueue = [];
                
                if(!isRecovery) updateLoadingMsg(`ANALIZANDO ${items.length} ITEMS...`, {current: i+1, total: total});
                
                for (const item of items) {
                    if (!item || !item.id) continue;
                    
                    let action;
                    if (isRecovery) {
                        // RECOVERY INTELIGENTE: Salvar medias altas transferibles
                        if (!item.untradeable && (item.rating >= 84)) action = 'TO_TRANSFER_LIST';
                        else if (item.untradeable) action = 'TO_CLUB';
                        else action = 'QUICK_SELL'; 
                    } else {
                        const isRealDupe = duplicateSet.has(item.id); 
                        action = analyzeItem(item, isRealDupe);
                    }

                    const type = (item.itemType || item.type || '').toLowerCase();
                    const isPlayer = (type === 'player');
                    
                    if (action === 'REDEEM') {
                        redeemQueue.push(item.id);
                        // Fix Bug Monedas (Claude)
                        SESSION_DATA.coins += (item.amount || item.value || 0); 
                        updateCoinDisplay();
                    }
                    else if (action.includes('QUICK_SELL')) {
                        discardQueue.push(item.id);
                        if (action === 'QUICK_SELL') { SESSION_DATA.coins += (item.discardValue || 0); updateCoinDisplay(); }
                    }
                    else if (action === 'TO_CLUB') moveQueue.push({ id: item.id, pile: "club" }); 
                    else if (action === 'TO_TRANSFER_LIST') moveQueue.push({ id: item.id, pile: "trade" }); 
                    else if (action === 'TO_SBC_STORAGE') moveQueue.push({ id: item.id, pile: "storage" }); 
                    
                    if (!isRecovery) {
                        const cat = isPlayer ? getCardType(item) : 'other';
                        SESSION_DATA.items.push({ id: item.id, pack: i+1, assetId: item.assetId, rating: item.rating||0, action: action, type: cat, status: "PENDIENTE", isPlayer: isPlayer });
                    }
                }

                if (redeemQueue.length > 0) {
                    updateLoadingMsg(`CANJEANDO MONEDAS...`);
                    for (const itemId of redeemQueue) { try { await EA_API.redeemSpecificItem(itemId); confirmStatus([itemId], "CANJEADO ($)"); } catch (e) {} }
                    await EA_API.updateCredits();
                }
                
                if (moveQueue.length > 0) {
                    if(!isRecovery) updateLoadingMsg(`GUARDANDO ${moveQueue.length} ITEMS...`);
                    try { 
                        await EA_API.moveItems(moveQueue); 
                        if(!isRecovery) confirmStatus(moveQueue.map(i => i.id), "MOVIDO OK"); 
                    } catch (e) {
                        if (isRecovery) {
                            try { await EA_API.discardItems(moveQueue.map(i => i.id)); } catch(e2) {}
                        } else if(e.message.includes("STORAGE")) { 
                            alert("⚠️ ALMACÉN LLENO"); hideLoadingOverlay(); return; 
                        }
                    }
                }

                if (discardQueue.length > 0) {
                    if(!isRecovery) updateLoadingMsg(`VENDIENDO ${discardQueue.length} ITEMS...`);
                    try { 
                        await EA_API.discardItems(discardQueue); 
                        if(!isRecovery) confirmStatus(discardQueue, "VENDIDO"); 
                    } catch (e) {} 
                }
                
                await new Promise(r => setTimeout(r, config.speed === 'fast' ? 500 : 1500));
            } catch (error) { console.error("Error:", error); if (!error.message.includes("401")) { hideLoadingOverlay(); if(!error.message.includes("PACK_NOT_FOUND")) alert(`Error: ${error.message}`); break; } }
            finally { clearTimeout(timeoutId); }
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

        hideLoadingOverlay(); if(CONFIG.soundEnabled) SOUNDS.complete(); if (config.showReport) showReport(); else alert("✅ Finalizado");
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
        const overlay = document.createElement('div'); overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:999999;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(2px);";
        document.addEventListener('keydown', function(e) { if(e.key === "Escape") overlay.remove(); }, {once:true});
        const mkSel = (cat, context, val) => { let options = []; if (context === 'new') options = [['club','Club'], ['trade','Transferible'], ['discard','Venta']]; else if (context === 'dupeTrans') options = [['trade','Transferible'], ['discard','Venta']]; else if (context === 'dupeIntrans') options = [['storage','SBC'], ['discard','Venta (0)']]; let html = `<select onchange="window.updateRule('${cat}','${context}',this.value)" style="background:#333;color:#fff;border:1px solid #555;padding:4px;width:100%;">`; options.forEach(opt => { html += `<option value="${opt[0]}" ${val === opt[0] ? 'selected' : ''}>${opt[1]}</option>`; }); return html + `</select>`; };
        const renderLeagues = () => CONFIG.leagues.map(id => `<span style="background:#00d2be;color:#000;padding:4px 8px;border-radius:4px;margin-right:5px;font-size:11px;display:inline-block;margin-bottom:5px;">${getLeagueName(id)} <b onclick="window.removeLeague(${id})" style="cursor:pointer;margin-left:5px;color:#c0392b;font-weight:bold;">✕</b></span>`).join('');
        let leagueOptions = `<option value="">-- Selecciona Liga --</option>`; Object.entries(ALL_LEAGUES).sort((a,b) => a[1].localeCompare(b[1])).forEach(([id, name]) => { leagueOptions += `<option value="${id}">${name}</option>`; });
        let html = `<div style="background:#181818;color:#fff;font-family:sans-serif;width:750px;padding:25px;border:1px solid #00d2be;border-radius:8px;max-height:95vh;overflow-y:auto;"><h3 style="color:#00d2be;border-bottom:1px solid #333;padding-bottom:10px;margin-top:0;">⚙️ CONFIGURACIÓN <span style="font-size:12px;color:#666;float:right">(ESC)</span></h3><div style="margin-bottom:20px;background:#222;padding:15px;border-radius:5px;border:1px solid #333;"><label style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;"><span style="font-weight:bold;color:#00d2be;">🔊 Efectos de Sonido</span><input type="checkbox" id="sound-toggle" ${CONFIG.soundEnabled ? 'checked' : ''} onchange="window.toggleSound(this.checked)" style="transform:scale(1.5);cursor:pointer;"></label></div><div style="margin-bottom:20px;background:#222;padding:15px;border-radius:5px;border:1px solid #333;"><div style="font-weight:bold;margin-bottom:5px;color:#f39c12;">🏆 LIGAS IMPORTANTES</div><div id="league-list" style="margin-bottom:15px;padding:5px;background:#1a1a1a;border:1px solid #444;border-radius:4px;min-height:40px;">${renderLeagues()}</div><div style="display:flex;gap:10px;"><select id="league-selector" style="flex:1;padding:8px;background:#333;border:1px solid #555;color:#fff;">${leagueOptions}</select><button onclick="window.addLeague()" style="background:#00d2be;color:#000;border:none;padding:8px 15px;cursor:pointer;font-weight:bold;border-radius:3px;">AÑADIR</button></div></div><table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;"><tr style="color:#aaa;text-align:left;"><th style="padding:8px;">TIPO</th><th style="padding:8px;">NUEVO</th><th style="padding:8px;">REPE (INTRANS)</th><th style="padding:8px;">REPE (TRANS)</th></tr><tr style="border-bottom:1px solid #333;"><td style="padding:10px;color:#9b59b6;font-weight:bold;">ESPECIAL</td><td>${mkSel('special','new',CONFIG.rules.special.new)}</td><td>${mkSel('special','dupeIntrans',CONFIG.rules.special.dupeIntrans)}</td><td>${mkSel('special','dupeTrans',CONFIG.rules.special.dupeTrans)}</td></tr><tr style="border-bottom:1px solid #333;"><td style="padding:10px;color:#f1c40f;font-weight:bold;">ORO</td><td>${mkSel('gold','new',CONFIG.rules.gold.new)}</td><td>${mkSel('gold','dupeIntrans',CONFIG.rules.gold.dupeIntrans)}</td><td>${mkSel('gold','dupeTrans',CONFIG.rules.gold.dupeTrans)}<div style="margin-top:5px;font-size:10px;color:#aaa;">Vender < <input type="number" value="${CONFIG.rules.gold.minRatingSell}" style="width:30px;text-align:center;background:#333;border:none;color:#fff;" onchange="window.updateRule('gold','minRatingSell',this.value)"></div></td></tr></table><button id="save-cfg" style="width:100%;padding:12px;background:#00d2be;border:none;font-weight:bold;cursor:pointer;font-size:14px;border-radius:4px;">GUARDAR CAMBIOS</button></div>`;
        overlay.innerHTML = html; document.body.appendChild(overlay);
        window.updateRule = (cat, key, val) => { if(key === 'minRatingSell') val = parseInt(val); CONFIG.rules[cat][key] = val; };
        window.toggleSound = (enabled) => { CONFIG.soundEnabled = enabled; };
        window.addLeague = () => { const id = parseInt(document.getElementById('league-selector').value); if(id && !CONFIG.leagues.includes(id)) { CONFIG.leagues.push(id); document.getElementById('league-list').innerHTML = renderLeagues(); } else if (CONFIG.leagues.includes(id)) { alert('⚠️ Liga ya añadida'); }};
        window.removeLeague = (id) => { CONFIG.leagues = CONFIG.leagues.filter(l => l !== id); document.getElementById('league-list').innerHTML = renderLeagues(); };
        document.getElementById('save-cfg').onclick = () => { saveConfig(); overlay.remove(); alert('✅ Configuración guardada'); };
    }

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

    function initUI() {
        if (!document.body) { setTimeout(initUI, 100); return; }
        const style = document.createElement("style");
        style.innerHTML = ".my-btn{background:#1e272e;color:#00d2be;border:1px solid #00d2be;padding:0 15px;font-weight:bold;cursor:pointer;margin-left:10px;}";
        document.head.appendChild(style);
        function showMenu(packId) {
            const overlay = document.createElement('div');
            overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:99999;display:flex;justify-content:center;align-items:center";
            overlay.innerHTML = `<div style="background:#181818;color:#fff;width:380px;padding:25px;border:1px solid #00d2be;font-family:sans-serif;border-radius:8px;"><div style="color:#00d2be;font-weight:bold;margin-bottom:20px;font-size:18px;text-align:center;">⚡ PRO OPENER 3.0</div><div style="margin-bottom:15px"><label style="display:block;margin-bottom:5px;font-size:13px;color:#aaa;">Cantidad:</label><input type="number" id="qty" value="1" min="1" style="width:100%;padding:8px;background:#333;border:1px solid #555;color:#fff;border-radius:4px;"></div><div style="margin-bottom:20px"><label style="display:block;margin-bottom:5px;font-size:13px;color:#aaa;">Velocidad:</label><select id="speed" style="width:100%;padding:8px;background:#333;border:1px solid #555;color:#fff;border-radius:4px;"><option value="slow">Segura (3.5s)</option><option value="medium">Media (2.5s)</option><option value="fast">Rápida (1.2s)</option></select></div><div style="margin-bottom:20px;background:#222;padding:10px;border-radius:4px;border:1px solid #444;"><label style="cursor:pointer;display:flex;align-items:center;font-weight:bold;font-size:13px;"><input type="checkbox" id="chk-tradeable" style="margin-right:8px;transform:scale(1.2);"> 💱 Es Transferible (Tienda)</label></div><button id="btn-cfg" style="width:100%;padding:10px;background:#333;color:#fff;border:1px solid #555;cursor:pointer;margin-bottom:10px;border-radius:4px;">⚙️ PERSONALIZAR</button><div style="display:flex;gap:10px;margin-top:20px;"><button id="btn-cancel" style="flex:1;padding:12px;background:transparent;border:1px solid #e74c3c;color:#e74c3c;cursor:pointer;border-radius:4px;font-weight:bold;">CERRAR</button><button id="btn-run" style="flex:2;padding:12px;background:#00d2be;color:#000;border:none;cursor:pointer;font-weight:bold;border-radius:4px;">EJECUTAR</button></div><div style="text-align:center;margin-top:15px;font-size:11px;color:#666;"><span id="token-status" style="color:${SESSION_TOKEN ? '#00ff88':'orange'}">● ${SESSION_TOKEN ? 'SISTEMA CONECTADO':'ESPERANDO DATOS'}</span><br><label style="cursor:pointer;margin-top:5px;display:inline-block;"><input type="checkbox" id="chk-report" checked> Ver Informe</label><br><label style="cursor:pointer;margin-top:5px;display:inline-block;"><input type="checkbox" id="chk-sound" ${CONFIG.soundEnabled ? 'checked' : ''}> 🔊 Sonidos <span style="font-size:10px;color:#666">(ESC para salir)</span></label></div></div>`;
            document.body.appendChild(overlay);
            document.getElementById('btn-cancel').onclick = () => overlay.remove();
            document.getElementById('btn-cfg').onclick = () => showConfigSettings();
            document.getElementById('btn-run').onclick = () => { if (!SESSION_TOKEN) { alert("Navega por la web."); return; } CONFIG.soundEnabled = document.getElementById('chk-sound').checked; saveConfig(); const cfg = { qty: document.getElementById('qty').value, speed: document.getElementById('speed').value, isTradeable: document.getElementById('chk-tradeable').checked, showReport: document.getElementById('chk-report').checked }; overlay.remove(); startEngine(packId, cfg); };
        }
        function inject(footer) { if (footer.querySelector('.my-btn')) return; const view = footer.closest('.ut-store-pack-details-view'); const btn = document.createElement('button'); btn.className = 'my-btn'; btn.innerText = '⚡'; btn.onclick = (e) => { e.preventDefault(); const pid = view ? (view.getAttribute('data-id') || "0") : "0"; showMenu(pid); }; footer.appendChild(btn); }
        const obs = new MutationObserver(e => e.forEach(m => { if(m.addedNodes.length) { const f = document.getElementsByClassName("ut-store-pack-details-view--footer"); for(let x of f) inject(x); } }));
        obs.observe(document.body, {childList:true, subtree:true});
    }
    initUI();
})();
