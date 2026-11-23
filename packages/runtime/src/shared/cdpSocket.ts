import { bindCdpSocket, type CdpSocketOpener } from "@vibestudio/rpc/protocol/cdpSocket";
export type CdpSocketBinder = (endpoint: {wsEndpoint:string;token?:string}, preferFetchUpgrade?:boolean) => CdpSocketOpener;

/** Unconfined panels/workers use their own native platform. Confined hosted
 * factories receive this exact capability from their real kernel instead. */
export const bindNativeCdpSocket: CdpSocketBinder = (endpoint,preferFetchUpgrade=false) => {
  const opener=bindCdpSocket(endpoint,{platform:globalThis});
  return (url,token,prefer,signal)=>opener(url,token,preferFetchUpgrade || prefer,signal);
};
