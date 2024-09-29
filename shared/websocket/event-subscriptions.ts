import { BehaviorSubject, map } from "rxjs";

export function subscriptionHandler() {
    type SubscribedEvents = Record<string, number>;
    const subscriptions: SubscribedEvents = {};
    const subscriptions$ = new BehaviorSubject<SubscribedEvents>(subscriptions);

    function subscribe(event: string) {
        if (!subscriptions[event]) {
            subscriptions[event] = 0;
            subscriptions$.next(subscriptions);
        }
        subscriptions[event]++;

        return {
            unsubscribe: () => {
                subscriptions[event]--;
                if (subscriptions[event] == 0) {
                    delete subscriptions[event];
                    subscriptions$.next(subscriptions);
                }
            }
        }
    }

    return {
        subscriptions$: subscriptions$.pipe(
            map(subscriptions => Object.keys(subscriptions))
        ),
        subscribe
    }
}