import {BaseError, ExecutionRevertedError, HttpRequestError, LimitExceededRpcError, TimeoutError, fallback, http} from 'viem';

export const PUBLIC_MAINNET_RPC = 'https://ethereum-rpc.publicnode.com';

/** Bounded provider failover. This caches provider failures, never chain evidence. */
export function mainnetTransport(primary, options = {}) {
  const timeout = options.timeout ?? 2500;
  const urls = [...new Set([primary?.trim(), PUBLIC_MAINNET_RPC].filter(Boolean))];
  const transports = urls.map(url => {
    let unavailableUntil = 0;
    const transport = http(url, {
      batch: true, ...options, timeout, retryCount: 0,
      // Viem uses caller cancellation instead of its timeout signal. Compose
      // them per fetch so a stalled provider cannot consume the whole read budget.
      fetchFn(url, init) {
        const deadline = AbortSignal.timeout(timeout);
        const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
        return (options.fetchFn ?? fetch)(url, {...init, signal});
      },
      async onFetchResponse(response) {
        if ([401, 403, 429].includes(response.status)) unavailableUntil = Date.now() + 60_000;
        await options.onFetchResponse?.(response);
      },
    });
    return parameters => {
      const configured = transport({...parameters, timeout});
      return {
        ...configured,
        async request(args, requestOptions) {
          options.fetchOptions?.signal?.throwIfAborted();
          if (Date.now() < unavailableUntil) throw new Error('Ethereum provider temporarily unavailable');
          try {
            return await configured.request(args, requestOptions);
          } catch (error) {
            const reverted = error instanceof BaseError && error.walk(cause => {
              const data = typeof cause?.data === 'string' ? cause.data : cause?.data?.data;
              return cause?.code === 3 || typeof data === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(data);
            });
            if (reverted) {
              // Viem's default fallback matches revert wording. Supply the
              // standard code and wording even for generic/custom RPC errors.
              throw Object.assign(new ExecutionRevertedError({cause: error}), {
                code: ExecutionRevertedError.code,
                message: 'execution reverted',
              });
            }
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
