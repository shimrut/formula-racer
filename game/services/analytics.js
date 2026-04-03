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

    trackSupportClick() {
        this.track('support-click');
    }

    trackHeaderMenuOpen() {
        this.track('header-menu-open');
    }

    trackHowToPlayOpen() {
        this.track('how-to-play-open');
    }

    trackTrialRace(stats) {
        this.track('trial-race', stats);
    }

    trackSessionRace(stats) {
        this.track('session-race', stats);
    }

    trackMapEvent(mapStats) {
        this.track('map-event', mapStats);
    }

    trackPageview(url, title) {
        if (typeof umami === 'undefined') return;
        umami.track((props) => ({ ...props, url, title }));
    }
}
