(function () {
    const textElement = document.getElementById('siteTitleText');
    if (!textElement) return;

    const sequence = [
        "Старокостянтинів",
        "Starokonstantynów",
        "Starokostiantyniv",
        "Starokostjantyniw",
        "סטרוקונסטנטינוב",
        "STAROKOSTIANTYNIV.COM"
    ];

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function updateText(val) {
        textElement.textContent = val;
        textElement.setAttribute('data-text', val);
    }

    async function changeTextNatural(newText) {
        textElement.className = 'site-title-text animate-flip-out';
        await sleep(180);
        updateText(newText);
        textElement.className = 'site-title-text animate-flip-in';
        await sleep(220);
        textElement.className = 'site-title-text';
    }

    async function suddenAppear(newText) {
        textElement.className = 'site-title-text';
        textElement.style.opacity = '0';
        await sleep(50);
        updateText(newText);
        textElement.className = 'site-title-text animate-sudden';
        await sleep(100);
        textElement.style.opacity = '1';
    }

    async function runPerfectWave() {
        textElement.classList.add('has-wave');
        await sleep(850);
        textElement.classList.remove('has-wave');
    }

    async function mainLoop() {
        while (true) {
            await sleep(600);
            await changeTextNatural(sequence[1]);
            await sleep(600);
            await changeTextNatural(sequence[2]);
            await sleep(600);
            await changeTextNatural(sequence[3]);
            await sleep(600);
            await changeTextNatural(sequence[4]);
            await sleep(600);
            await suddenAppear(sequence[5]);
            await sleep(5000);
            await runPerfectWave();
            await changeTextNatural(sequence[0]);
        }
    }

    mainLoop();
})();
