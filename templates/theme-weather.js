(function () {
    // ---------- День / Ніч ----------
    const THEME_KEY = 'starkon-theme';
    const toggle = document.getElementById('themeToggle');

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(savedTheme);

    if (toggle) {
        toggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            localStorage.setItem(THEME_KEY, next);
        });
    }

    // ---------- Погода (Старокостянтинів) ----------
    const weatherEl = document.getElementById('weatherBadge');
    if (!weatherEl) return;

    const LAT = 49.7597, LON = 27.2069;
    const CACHE_KEY = 'starkon-weather-cache';
    const CACHE_MS = 30 * 60 * 1000; // 30 хв

    const WEATHER_ICONS = {
        clear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
        cloud: '<svg viewBox="0 0 24 24"><path d="M6 18a4 4 0 1 1 .7-7.94A5.5 5.5 0 0 1 17.5 12H18a3.5 3.5 0 0 1 0 7H6z"/></svg>',
        rain: '<svg viewBox="0 0 24 24"><path d="M6 15a4 4 0 1 1 .7-7.94A5.5 5.5 0 0 1 16.5 9H17a3.5 3.5 0 0 1 0 7H6z"/><path d="M8 19l-1 3M13 19l-1 3M18 19l-1 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
        snow: '<svg viewBox="0 0 24 24"><path d="M6 13a4 4 0 1 1 .7-7.94A5.5 5.5 0 0 1 16.5 7H17a3.5 3.5 0 0 1 0 7H6z"/><path d="M8 18v4M6.5 19.5l3 1M9.5 19.5l-3 1M16 18v4M14.5 19.5l3 1M17.5 19.5l-3 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
        thunder: '<svg viewBox="0 0 24 24"><path d="M6 14a4 4 0 1 1 .7-7.94A5.5 5.5 0 0 1 16.5 8H17a3.5 3.5 0 0 1 0 7H6z"/><path d="M13 13l-3 5h2.5l-1.5 4 4-5.5H12.5L13 13z" fill="currentColor"/></svg>'
    };

    function iconFor(code) {
        if (code === 0) return WEATHER_ICONS.clear;
        if ([1, 2, 3, 45, 48].includes(code)) return WEATHER_ICONS.cloud;
        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return WEATHER_ICONS.rain;
        if ([71, 73, 75, 77, 85, 86].includes(code)) return WEATHER_ICONS.snow;
        if ([95, 96, 99].includes(code)) return WEATHER_ICONS.thunder;
        return WEATHER_ICONS.cloud;
    }

    function render(temp, code) {
        weatherEl.innerHTML = `${iconFor(code)}<span>${Math.round(temp)}°</span>`;
    }

    function fromCache() {
        try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (Date.now() - data.ts > CACHE_MS) return null;
            return data;
        } catch (e) { return null; }
    }

    const cached = fromCache();
    if (cached) {
        render(cached.temp, cached.code);
    } else {
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true`)
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                const w = data.current_weather;
                render(w.temperature, w.weathercode);
                try {
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ temp: w.temperature, code: w.weathercode, ts: Date.now() }));
                } catch (e) {}
            })
            .catch(() => { weatherEl.style.display = 'none'; });
    }
})();
