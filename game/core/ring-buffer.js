/**
 * Fixed-capacity ring buffer with pre-allocated slots.
 * After construction, write() operations never allocate memory.
 */
export class RingBuffer {
    /**
     * @param {number} capacity Maximum number of items
     * @param {Function} factory Creates a blank slot object (called once per slot at init)
     */
    constructor(capacity, factory) {
        this.capacity = capacity;
        this._items = new Array(capacity);
        for (let i = 0; i < capacity; i++) {
            this._items[i] = factory();
        }
        this.length = 0;
        this._head = 0;
    }

    /**
     * Returns the next writable pre-allocated slot.
     * If at capacity, the oldest item is evicted.
     * Caller MUST fill the returned object's fields before the next write().
     */
    write() {
        const idx = (this._head + this.length) % this.capacity;
        if (this.length < this.capacity) {
            this.length++;
        } else {
            this._head = (this._head + 1) % this.capacity;
        }
        return this._items[idx];
    }

    /** Get item at logical index i (0 = oldest). */
    get(i) {
        return this._items[(this._head + i) % this.capacity];
    }

    /** Get the most recently written item, or null if empty. */
    last() {
        if (this.length === 0) return null;
        return this._items[(this._head + this.length - 1) % this.capacity];
    }

    /** Reset to empty without deallocating slots. */
    clear() {
        this.length = 0;
        this._head = 0;
    }

    /** Create a plain-object snapshot array (for serialization/share — NOT hot path). */
    toArray() {
        const out = new Array(this.length);
        for (let i = 0; i < this.length; i++) {
            const src = this._items[(this._head + i) % this.capacity];
            out[i] = { x: src.x, y: src.y };
        }
        return out;
    }
}
