document.addEventListener('DOMContentLoaded', () => {
    const dropdowns = Array.from(document.querySelectorAll('[data-support-dropdown]')).map((root) => {
        const trigger = root.querySelector('[data-support-trigger]');
        const menu = root.querySelector('[data-support-menu]');

        if (!(trigger instanceof HTMLAnchorElement) || !(menu instanceof HTMLElement)) {
            return null;
        }

        const setOpen = (isOpen) => {
            menu.hidden = !isOpen;
            trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        };

        setOpen(false);

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            const shouldOpen = menu.hidden;

            dropdowns.forEach((dropdown) => {
                dropdown?.setOpen(false);
            });

            setOpen(shouldOpen);
        });

        trigger.addEventListener('keydown', (event) => {
            if (event.key !== ' ' && event.key !== 'Spacebar') return;
            event.preventDefault();
            trigger.click();
        });

        menu.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => setOpen(false));
        });

        return { root, trigger, menu, setOpen };
    }).filter(Boolean);

    if (!dropdowns.length) return;

    document.addEventListener('click', (event) => {
        dropdowns.forEach((dropdown) => {
            if (!dropdown.root.contains(event.target)) {
                dropdown.setOpen(false);
            }
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        dropdowns.forEach((dropdown) => {
            if (dropdown.menu.hidden) return;
            dropdown.setOpen(false);
            dropdown.trigger.focus();
        });
    });

    document.addEventListener('header-menu-opened', () => {
        dropdowns.forEach((dropdown) => dropdown.setOpen(false));
    });
});
