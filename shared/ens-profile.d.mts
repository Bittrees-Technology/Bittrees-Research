export type SharedEnsProfile={wallet:string;name:string|null;avatar:string|null;bio:string|null;website:string|null;source:string;status:string;checkedAt?:string;editUrl?:string};
export function readEnsProfile(wallet:string,client:unknown):Promise<SharedEnsProfile>;
export function safeProfileUrl(value:unknown):string|null;
