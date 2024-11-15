import { BehaviorSubject, map } from "rxjs";

type SubscribedEvents = Record<string, number>;

export function subscriptionHandler() {
    const subscriptions: SubscribedEvents = {};
    const subscriptions$ = new BehaviorSubject<SubscribedEvents>(subscriptions);

    function subscribe(event: string) {
        if (!subscriptions[event]) {
            subscriptions[event] = 0;
            subscriptions$.next(subscriptions);
            //console.log(`Subscribe: ${event}`);
        }
        subscriptions[event]++;

        return {
            unsubscribe: () => {
                subscriptions[event]--;
                //console.log(`Unsubscribe: ${event}`);
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