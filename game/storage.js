// IndexedDB storage for lap times
import { DEFAULT_TRACK_PREFERENCES, TRACK_MODE_PRACTICE, TRACK_MODE_STANDARD } from './modes.js?v=1.85';

const DB_NAME = 'RacerLapTimes';
const DB_VERSION = 1;
const STORE_NAME = 'lapTimes';
const TRACK_PREFERENCES_KEY = 'RacerTrackPreferences';
const TRACK_DATA_BACKUP_KEY = 'RacerLapTimesBackup';

let db = null;
let dbPromise = null;
let hasAnyTrackDataCache = null;
const trackDataCache = new Map();
let trackPreferencesMapCache = null;
let trackDataBackupMapCache = null;
let restoreFromBackupPromise = null;
const MIN_SAVED_LAP_TIME = 2.0;
const MAX_SAVED_LAP_TIME = 60 * 60;

function isSavableLapTime(value) {
    return Number.isFinite(value) && value >= MIN_SAVED_LAP_TIME && value <= MAX_SAVED_LAP_TIME;
}

function cloneTrackData(trackData) {
    return {
        trackName: trackData.trackName,
        lapTimes: trackData.lapTimes.slice(),
        bestTime: trackData.bestTime,
        bestTimes: {
            [TRACK_MODE_STANDARD]: trackData.bestTimes[TRACK_MODE_STANDARD],
            [TRACK_MODE_PRACTICE]: trackData.bestTimes[TRACK_MODE_PRACTICE]
        },
        rankedLapTimes: trackData.rankedLapTimes.slice(),
        rankedBestTime: trackData.rankedBestTime,
        rankedBestTimes: {
            [TRACK_MODE_STANDARD]: trackData.rankedBestTimes[TRACK_MODE_STANDARD],
            [TRACK_MODE_PRACTICE]: trackData.rankedBestTimes[TRACK_MODE_PRACTICE]
        }
    };
}

async function initDB() {
    if (db) return db;

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            dbPromise = null;
            reject(request.error);
        };
        request.onsuccess = () => {
            db = request.result;
            db.onclose = () => {
                db = null;
                dbPromise = null;
            };
            if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
                navigator.storage.persist().catch(() => {});
            }
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'trackName' });
                objectStore.createIndex('trackName', 'trackName', { unique: true });
            }
        };
    });

    return dbPromise;
}

function readTrackDataBackupMap() {
    if (trackDataBackupMapCache) return trackDataBackupMapCache;

    try {
        const raw = window.localStorage.getItem(TRACK_DATA_BACKUP_KEY);
        if (!raw) {
            trackDataBackupMapCache = {};
            return trackDataBackupMapCache;
        }
        const parsed = JSON.parse(raw);
        trackDataBackupMapCache = parsed && typeof parsed === 'object' ? parsed : {};
        return trackDataBackupMapCache;
    } catch (error) {
        console.error('Error reading lap time backup:', error);
        trackDataBackupMapCache = {};
        return trackDataBackupMapCache;
    }
}

function writeTrackDataBackupMap(trackDataMap) {
    trackDataBackupMapCache = trackDataMap;
    try {
        window.localStorage.setItem(TRACK_DATA_BACKUP_KEY, JSON.stringify(trackDataMap));
    } catch (error) {
        console.error('Error saving lap time backup:', error);
    }
}

function saveTrackDataBackup(trackData) {
    if (!trackData?.trackName) return;

    const backupMap = readTrackDataBackupMap();
    writeTrackDataBackupMap({
        ...backupMap,
        [trackData.trackName]: cloneTrackData(trackData)
    });
}

function readTrackPreferencesMap() {
    if (trackPreferencesMapCache) return trackPreferencesMapCache;

    try {
        const raw = window.localStorage.getItem(TRACK_PREFERENCES_KEY);
        if (!raw) {
            trackPreferencesMapCache = {};
            return trackPreferencesMapCache;
        }
        const parsed = JSON.parse(raw);
        trackPreferencesMapCache = parsed && typeof parsed === 'object' ? parsed : {};
        return trackPreferencesMapCache;
    } catch (error) {
        console.error('Error reading track preferences:', error);
        trackPreferencesMapCache = {};
        return trackPreferencesMapCache;
    }
}

function writeTrackPreferencesMap(preferencesMap) {
    trackPreferencesMapCache = preferencesMap;
    try {
        window.localStorage.setItem(TRACK_PREFERENCES_KEY, JSON.stringify(preferencesMap));
    } catch (error) {
        console.error('Error saving track preferences:', error);
    }
}

function normalizeTrackData(trackName, rawTrackData) {
    const standardBest = (rawTrackData?.bestTimes?.[TRACK_MODE_STANDARD] ?? rawTrackData?.bestTime) ?? null;
    const practiceBest = rawTrackData?.bestTimes?.[TRACK_MODE_PRACTICE] ?? null;
    const rankedStandardBest = (rawTrackData?.rankedBestTimes?.[TRACK_MODE_STANDARD] ?? rawTrackData?.rankedBestTime) ?? null;
    const rankedPracticeBest = rawTrackData?.rankedBestTimes?.[TRACK_MODE_PRACTICE] ?? null;

    return {
        trackName,
        lapTimes: Array.isArray(rawTrackData?.lapTimes) ? rawTrackData.lapTimes.slice() : [],
        bestTime: standardBest,
        bestTimes: {
            [TRACK_MODE_STANDARD]: standardBest,
            [TRACK_MODE_PRACTICE]: practiceBest
        },
        rankedLapTimes: Array.isArray(rawTrackData?.rankedLapTimes) ? rawTrackData.rankedLapTimes.slice() : [],
        rankedBestTime: rankedStandardBest,
        rankedBestTimes: {
            [TRACK_MODE_STANDARD]: rankedStandardBest,
            [TRACK_MODE_PRACTICE]: rankedPracticeBest
        }
    };
}

export function getTrackPreferences(trackKey) {
    if (!trackKey) return { ...DEFAULT_TRACK_PREFERENCES };

    const preferencesMap = readTrackPreferencesMap();
    const stored = preferencesMap[trackKey];
    return {
        ...DEFAULT_TRACK_PREFERENCES,
        ...(stored && typeof stored === 'object' ? stored : {})
    };
}

export function saveTrackPreferences(trackKey, nextPreferences) {
    if (!trackKey) return { ...DEFAULT_TRACK_PREFERENCES };

    const preferencesMap = readTrackPreferencesMap();
    const merged = {
        ...DEFAULT_TRACK_PREFERENCES,
        ...(preferencesMap[trackKey] && typeof preferencesMap[trackKey] === 'object' ? preferencesMap[trackKey] : {}),
        ...(nextPreferences && typeof nextPreferences === 'object' ? nextPreferences : {})
    };

    writeTrackPreferencesMap({
        ...preferencesMap,
        [trackKey]: merged
    });
    return { ...merged };
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
        if (event.key === TRACK_PREFERENCES_KEY) {
            trackPreferencesMapCache = null;
        }
        if (event.key === TRACK_DATA_BACKUP_KEY) {
            trackDataBackupMapCache = null;
        }
    });
}

function putTrackData(store, trackData, resolve, reject) {
    const putRequest = store.put(trackData);
    putRequest.onsuccess = () => resolve();
    putRequest.onerror = () => reject(putRequest.error);
}

function getBackupTrackData(trackName) {
    const backupMap = readTrackDataBackupMap();
    if (!backupMap[trackName]) return null;
    return normalizeTrackData(trackName, backupMap[trackName]);
}

async function restoreTrackDataFromBackup(database, trackName) {
    const backupTrackData = getBackupTrackData(trackName);
    if (!backupTrackData) return null;

    await new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        putTrackData(store, backupTrackData, resolve, reject);
    });

    hasAnyTrackDataCache = true;
    trackDataCache.set(trackName, cloneTrackData(backupTrackData));
    return cloneTrackData(backupTrackData);
}

async function restoreAllTrackDataFromBackup(database) {
    if (restoreFromBackupPromise) return restoreFromBackupPromise;

    const backupMap = readTrackDataBackupMap();
    const backupEntries = Object.entries(backupMap);
    if (!backupEntries.length) return false;

    restoreFromBackupPromise = new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        let pendingWrites = backupEntries.length;
        let settled = false;

        const finish = (didRestore) => {
            if (settled) return;
            settled = true;
            if (didRestore) {
                hasAnyTrackDataCache = true;
                backupEntries.forEach(([trackName, rawTrackData]) => {
                    trackDataCache.set(trackName, normalizeTrackData(trackName, rawTrackData));
                });
            }
            resolve(didRestore);
        };

        transaction.oncomplete = () => finish(true);
        transaction.onerror = () => {
            if (!settled) {
                settled = true;
                reject(transaction.error);
            }
        };
        transaction.onabort = () => {
            if (!settled) {
                settled = true;
                reject(transaction.error);
            }
        };

        backupEntries.forEach(([trackName, rawTrackData]) => {
            const trackData = normalizeTrackData(trackName, rawTrackData);
            const putRequest = store.put(trackData);
            putRequest.onsuccess = () => {
                pendingWrites -= 1;
                if (pendingWrites === 0) {
                    finish(true);
                }
            };
            putRequest.onerror = () => {
                if (!settled) {
                    settled = true;
                    reject(putRequest.error);
                }
            };
        });
    }).finally(() => {
        restoreFromBackupPromise = null;
    });

    return restoreFromBackupPromise;
}

export async function saveLapTime(trackName, lapTime, { ranked = false, replay = null } = {}) {
    if (!isSavableLapTime(lapTime)) {
        throw new TypeError(`Invalid lap time: ${lapTime}`);
    }

    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const getRequest = store.get(trackName);

        getRequest.onsuccess = () => {
            const trackData = normalizeTrackData(trackName, getRequest.result);
            const lapTimesKey = ranked ? 'rankedLapTimes' : 'lapTimes';
            const bestTimesKey = ranked ? 'rankedBestTimes' : 'bestTimes';
            const bestTimeKey = ranked ? 'rankedBestTime' : 'bestTime';
            const previousBest = trackData[bestTimesKey][TRACK_MODE_STANDARD];
            const isNewBest = previousBest === null || previousBest === undefined || lapTime < previousBest;

            // Add new lap time and keep only the 5 best
            trackData[lapTimesKey].push(lapTime);
            trackData[lapTimesKey].sort((a, b) => a - b);
            if (trackData[lapTimesKey].length > 5) {
                trackData[lapTimesKey] = trackData[lapTimesKey].slice(0, 5);
            }

            // Update best time (use proper floating point comparison)
            if (isNewBest) {
                trackData[bestTimesKey][TRACK_MODE_STANDARD] = lapTime;
            }
            trackData[bestTimeKey] = trackData[bestTimesKey][TRACK_MODE_STANDARD];

            const putRequest = store.put(trackData);
            putRequest.onsuccess = () => {
                hasAnyTrackDataCache = true;
                trackDataCache.set(trackName, cloneTrackData(trackData));
                saveTrackDataBackup(trackData);
                resolve(cloneTrackData(trackData));
            };
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

export async function saveBestTime(trackName, bestTime, mode = TRACK_MODE_PRACTICE, { ranked = false, replay = null } = {}) {
    if (!isSavableLapTime(bestTime)) {
        throw new TypeError(`Invalid best time: ${bestTime}`);
    }

    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const getRequest = store.get(trackName);

        getRequest.onsuccess = () => {
            const trackData = normalizeTrackData(trackName, getRequest.result);
            const bestTimesKey = ranked ? 'rankedBestTimes' : 'bestTimes';
            const bestTimeKey = ranked ? 'rankedBestTime' : 'bestTime';
            const previousBest = trackData[bestTimesKey][mode];
            const isNewBest = previousBest === null || previousBest === undefined || bestTime < previousBest;

            if (isNewBest) {
                trackData[bestTimesKey][mode] = bestTime;
            }
            trackData[bestTimeKey] = trackData[bestTimesKey][TRACK_MODE_STANDARD];

            const putRequest = store.put(trackData);
            putRequest.onsuccess = () => {
                hasAnyTrackDataCache = true;
                trackDataCache.set(trackName, cloneTrackData(trackData));
                saveTrackDataBackup(trackData);
                resolve(cloneTrackData(trackData));
            };
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

export async function syncBestTime(trackName, bestTime, mode = TRACK_MODE_STANDARD, { ranked = false, appendLapTime = false } = {}) {
    if (!isSavableLapTime(bestTime)) {
        throw new TypeError(`Invalid best time: ${bestTime}`);
    }

    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(trackName);

        getRequest.onsuccess = () => {
            const trackData = normalizeTrackData(trackName, getRequest.result);
            const lapTimesKey = ranked ? 'rankedLapTimes' : 'lapTimes';
            const bestTimesKey = ranked ? 'rankedBestTimes' : 'bestTimes';
            const bestTimeKey = ranked ? 'rankedBestTime' : 'bestTime';

            trackData[bestTimesKey][mode] = bestTime;
            trackData[bestTimeKey] = trackData[bestTimesKey][TRACK_MODE_STANDARD];

            if (appendLapTime && mode === TRACK_MODE_STANDARD) {
                trackData[lapTimesKey].push(bestTime);
                trackData[lapTimesKey].sort((a, b) => a - b);
                if (trackData[lapTimesKey].length > 5) {
                    trackData[lapTimesKey] = trackData[lapTimesKey].slice(0, 5);
                }
            }

            const putRequest = store.put(trackData);
            putRequest.onsuccess = () => {
                hasAnyTrackDataCache = true;
                trackDataCache.set(trackName, cloneTrackData(trackData));
                saveTrackDataBackup(trackData);
                resolve(cloneTrackData(trackData));
            };
            putRequest.onerror = () => reject(putRequest.error);
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

export async function hasAnyTrackData() {
    if (hasAnyTrackDataCache !== null) return hasAnyTrackDataCache;

    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            const hasAnyData = cursor !== null;
            if (hasAnyData) {
                hasAnyTrackDataCache = true;
                resolve(true);
                return;
            }

            restoreAllTrackDataFromBackup(database)
                .then((restored) => {
                    hasAnyTrackDataCache = restored;
                    resolve(restored);
                })
                .catch(reject);
        };

        request.onerror = () => reject(request.error);
    });
}

export async function getTrackData(trackName) {
    const cachedTrackData = trackDataCache.get(trackName);
    if (cachedTrackData) {
        return cloneTrackData(cachedTrackData);
    }

    const database = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(trackName);

        request.onsuccess = () => {
            if (request.result) {
                const trackData = normalizeTrackData(trackName, request.result);
                trackDataCache.set(trackName, cloneTrackData(trackData));
                resolve(cloneTrackData(trackData));
                return;
            }

            restoreTrackDataFromBackup(database, trackName)
                .then((restoredTrackData) => {
                    if (restoredTrackData) {
                        resolve(restoredTrackData);
                        return;
                    }

                    const emptyTrackData = normalizeTrackData(trackName, null);
                    trackDataCache.set(trackName, cloneTrackData(emptyTrackData));
                    resolve(cloneTrackData(emptyTrackData));
                })
                .catch(reject);
        };

        request.onerror = () => reject(request.error);
    });
}
