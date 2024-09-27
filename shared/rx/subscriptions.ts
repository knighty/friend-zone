type Subscription = {
    unsubscribe: () => void;
}

export default class Subscriptions {
    subscriptions: Subscription[] = [];

    constructor(...subscriptions: Subscription[]) {
        this.subscriptions = subscriptions;
    }

    add(subscription: Subscription) {
        this.subscriptions.push(subscription);
    }

    unsubscribe() {
        for (let s of this.subscriptions) {
            s.unsubscribe();
        }
        this.subscriptions = [];
    }
}