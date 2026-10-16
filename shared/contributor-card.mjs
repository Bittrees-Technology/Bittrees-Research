// Shared card renderer. Callers must supply the credential owner and a verified
// display name (ENS forward resolution must match owner); otherwise omit the name.
export function renderContributorCard({owner,verifiedDisplayName='',level,rank,status,logoBase64}) {
 if(!/^0x[a-fA-F0-9]{40}$/.test(owner||''))throw Error('A valid credential owner is required');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(logoBase64||''))throw Error('Original logo bytes are required');
 const levels=['Advisor','Part Time','Half Time','Full Time'];
 const ranks=['Contributor','Senior Contributor','Lead Contributor'];
 const states=['Active','Suspended','Ended','Revoked','Not yet effective','Expired'];
 const [l,r,s]=[level,rank,status];
 if(![l,r,s].every(Number.isInteger)||!levels[l]||!ranks[r]||!states[s])throw Error('Invalid contributor traits');
 const name=String(verifiedDisplayName).trim();
 if(name.length>64||/[\x00-\x1f\x7f]/.test(name))throw Error('Invalid display name');
 const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const label=escape(name||'Contributor');
 const nameSize=name.length>40?18:name.length>28?23:30;
 const shortAddress=owner.slice(0,6)+'…'+owner.slice(-4);
 const color=s===0?'#28683d':s===1?'#865a14':s===3?'#a33336':'#52616c';
 const rankColor=['#4b9156','#738591','#bc8a24'][r];
 const rings=Array.from({length:r+1},(_,i)=>`<rect x="${21+i*7}" y="${21+i*7}" width="${758-i*14}" height="${958-i*14}" rx="18" fill="none" stroke="${rankColor}" stroke-width="2"/>`).join('');
 const marks=Array.from({length:4},(_,i)=>`<rect x="${548+i*24}" y="698" width="16" height="16" rx="3" fill="${i<=l?'#28683d':'#dce6df'}"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><title>Bittrees Contributor — ${levels[l]}, ${ranks[r]}, ${states[s]}</title><rect width="800" height="1000" rx="24" fill="#f7fbf8"/>${rings}<text x="400" y="107" text-anchor="middle" font-family="Georgia,serif" font-size="44" fill="#204d32">Bittrees</text><text x="400" y="143" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#52655a">Contributor credential</text><image x="225" y="155" width="350" height="350" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${logoBase64}"/><g font-family="Arial,sans-serif"><text x="400" y="551" text-anchor="middle" font-size="${nameSize}" fill="#204d32">${label}</text><text x="400" y="584" text-anchor="middle" font-family="monospace" font-size="19" fill="#52655a">${shortAddress}</text><text x="400" y="653" text-anchor="middle" font-size="32" fill="#204d32">${ranks[r]}</text><path d="M100 678H700" stroke="#cddbd0"/><text x="100" y="717" font-size="25" fill="#204d32">${levels[l]}</text>${marks}<rect x="100" y="751" width="600" height="69" rx="12" fill="${color}"/><text x="400" y="795" text-anchor="middle" font-size="27" fill="white">${states[s]}</text><text x="400" y="864" text-anchor="middle" font-size="21" fill="#204d32">Memorandum of contribution</text><text x="400" y="943" text-anchor="middle" font-size="17" fill="#52655a">Non-transferable</text></g></svg>`;
}
