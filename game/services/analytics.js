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

    trackRaceEvent(stats) {
        this.track('race-event', {
            start: stats.start,
            crash: stats.crash,
            win: stats.win
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
