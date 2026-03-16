export class SessionFlagStore {
    get(key) {
        try {
            return sessionStorage.getItem(key) === '1';
        } catch (error) {
            return false;
        }
    }

    set(key, value) {
        try {
            sessionStorage.setItem(key, value);
        } catch (error) {
            // Storage access can fail in privacy-restricted contexts; gameplay should continue.
        }
    }
}
