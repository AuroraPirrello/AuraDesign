document.addEventListener('DOMContentLoaded', () => {
    const langToggles = document.querySelectorAll('.lang-toggle');
    const currentLang = localStorage.getItem('preferredLang') || 'it';

    applyLanguage(currentLang);

    langToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const newLang = toggle.getAttribute('data-lang');
            localStorage.setItem('preferredLang', newLang);
            applyLanguage(newLang);
        });
    });

    function applyLanguage(lang) {
        document.documentElement.lang = lang;
        
        // Update visibility
        const itElements = document.querySelectorAll('.lang-it');
        const enElements = document.querySelectorAll('.lang-en');
        
        if (lang === 'en') {
            itElements.forEach(el => el.classList.add('hidden'));
            enElements.forEach(el => el.classList.remove('hidden'));
        } else {
            itElements.forEach(el => el.classList.remove('hidden'));
            enElements.forEach(el => el.classList.add('hidden'));
        }

        // Update active state of toggles
        langToggles.forEach(toggle => {
            if (toggle.getAttribute('data-lang') === lang) {
                toggle.classList.add('underline', 'font-bold');
            } else {
                toggle.classList.remove('underline', 'font-bold');
            }
        });
    }
});
