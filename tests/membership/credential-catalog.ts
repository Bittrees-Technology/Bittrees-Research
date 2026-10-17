export * from '../../src/lib/community';
import {useQuery} from '@tanstack/react-query';
import {keccak256,toBytes} from 'viem';
export type CredentialDefinition={label:string;identifier:string;credentialType:`0x${string}`;metadataURI:string};
let definitions:CredentialDefinition[]=[];
export function useCommunity(){return useQuery({queryKey:['community'],queryFn:async()=>({credentialdefs:definitions})});}
export async function createCredentialDefinition(d:any){(window as any).__catalogWrites=((window as any).__catalogWrites||0)+1;definitions=[...definitions,{label:d.label,identifier:d.identifier,credentialType:keccak256(toBytes(d.identifier)),metadataURI:d.metadataURI}];}
