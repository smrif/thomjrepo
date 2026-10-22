export const SCOPE = 'synthetic-v1';
export const CALLBACK = 'whoseday-feasibility://auth/callback';
export function localDay(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0')].join('-');
}
export function validateRecord(record) {
  if(!record || Object.keys(record).some(key=>!['schema','day','week','diary','attachment','loggedAt'].includes(key)) || typeof record.loggedAt!=='string' || record.loggedAt.length>40 || !Number.isFinite(Date.parse(record.loggedAt)))throw new Error('Invalid test record metadata.');
  if(record?.schema !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(record.day) || !['dad','mom'].includes(record.week)) throw new Error('Invalid test record.');
  const d=new Date(record.day+'T12:00:00');
  if(!Number.isFinite(d.getTime()) || localDay(d)!==record.day)throw new Error('Invalid date.');
  if(typeof record.diary !== 'string' || record.diary.length>4000)throw new Error('Keep test notes under 4,000 characters.');
  if(record.attachment && (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(record.attachment) || record.attachment.length>4*1024*1024)) throw new Error('Choose a JPEG/PNG smaller than 3 MB.');
  return record;
}
export function recordKey(day){return 'record:'+SCOPE+':'+day}
export function createRepository(vault) {
  return {
    async save(record){
      validateRecord(record);
      const value=JSON.stringify(record),key=recordKey(record.day);
      await vault.write({key,value});
      const saved=await vault.read({key});
      if(saved.value!==value)throw new Error('The saved record could not be verified.');
      return JSON.parse(saved.value);
    },
    async load(day){
      const {value}=await vault.read({key:recordKey(day)});
      return value ? validateRecord(JSON.parse(value)) : null;
    }
  };
}
export function callbackCode(raw) {
  const url=new URL(raw),expected=new URL(CALLBACK);
  if(url.protocol!==expected.protocol || url.hostname!==expected.hostname || url.pathname!==expected.pathname || url.port || url.username || url.password || url.hash)throw new Error('Unrecognized sign-in return.');
  if(url.searchParams.has('error'))throw new Error('This sign-in link could not be verified. Request a new one.');
  const codes=url.searchParams.getAll('code');
  if(codes.length!==1 || !/^[A-Za-z0-9_-]{8,512}$/.test(codes[0]))throw new Error('This sign-in link is incomplete. Request a new one.');
  return codes[0];
}
export function reportText(record) {
  validateRecord(record);
  return 'WHOSE DAY — FEASIBILITY TEST\n\nSynthetic records only. Not a real custody report.\n\nDate: '+record.day+'\nScheduled parent: '+(record.week==='dad'?'Parent A':'Parent B')+'\n\n'+record.diary+'\n\nAttachment: '+(record.attachment?'Included in local record; not embedded in this test PDF.':'None')+'\n\nSaved on device: '+record.loggedAt;
}
