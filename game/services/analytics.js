export class AnalyticsService {
    track(eventName, payload) {
        if (typeof umami === 'undefined') return;

        if (payload === undefined) {
            umami.track(eventName);
            return;
        }

        umami.track(eventName, payload);
    }

    trackPlayerType(isReturningPlayer) {
        this.track(isReturningPlayer ? 'returning-player' : 'new-player');
    }

    trackChallengeShare() {
        this.track('challenge_friend_share');
    }

    trackTrialRace(stats) {
        this.track('trial-race', {
            start: stats.start,
            crash: stats.crash,
            win: stats.win
        });
    }

    trackSessionRace(stats) {
        this.track('session-race', {
            start: stats.start,
            crash: stats.crash
        });
    }

    trackMapEvent(mapStats) {
        this.track('map-event', mapStats);
    }

    trackPageview(url, title) {
        if (typeof umami === 'undefined') return;
        umami.track((props) => ({ ...props, url, title }));
    }
}
