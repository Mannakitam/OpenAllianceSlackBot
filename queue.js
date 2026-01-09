const channelQueues = new Map();

export function enqueue(channelId, task) {
    const prev = channelQueues.get(channelId) || Promise.resolve();

    const next = prev
        .then(() => task())
        .catch(err => {
            console.error(`[QUEUE ERROR][${channelId}]`, err);
        });

    channelQueues.set(channelId, next);
}
