import {BaseError, HttpRequestError, LimitExceededRpcError, TimeoutError, fallback, http} from 'viem';

export const PUBLIC_MAINNET_RPC = 'https://ethereum-rpc.publicnode.com';

/** Bounded provider failover. This caches provider failures, never chain evidence. */
export function mainnetTransport(primary, options = {}) {
  const urls = [...new Set([primary?.trim(), PUBLIC_MAINNET_RPC].filter(Boolean))];
  const transports = urls.map(url => {
    let unavailableUntil = 0;
    const transport = http(url, {
      batch: true, timeout: 2500, ...options, retryCount: 0,
      async onFetchResponse(response) {
        if ([401, 403, 429].includes(response.status)) unavailableUntil = Date.now() + 60_000;
        await options.onFetchResponse?.(response);
      },
    });
    return parameters => {
      const configured = transport({...parameters, timeout: options.timeout ?? 2500});
      return {
        ...configured,
        async request(args, requestOptions) {
          options.fetchOptions?.signal?.throwIfAborted();
          if (Date.now() < unavailableUntil) throw new Error('Ethereum provider temporarily unavailable');
          try {
            return await configured.request(args, requestOptions);
          } catch (error) {
            const unavailable = error instanceof BaseError && error.walk(cause =>
              cause instanceof HttpRequestError || cause instanceof TimeoutError || cause instanceof LimitExceededRpcError);
            if (unavailable instanceof HttpRequestError || unavailable instanceof TimeoutError || unavailable instanceof LimitExceededRpcError) {
              unavailableUntil = Date.now() + 60_000;
            }
            throw error;
          }
        },
      };
    };
  });
  return fallback(transports, {rank: false, retryCount: 0});
}
