export const REPORT_LIMIT=1024*1024,CSV_LIMIT=25*1024*1024;
export const REPORT_TYPES=['honest','dadactual','momsweek','full','notes'];
export function checkedText(text,limit,label){
  if(typeof text!=='string'||!text||new TextEncoder().encode(text).length>limit)throw Error(label+' is too large or empty. Choose a shorter period or use a JSON backup.');
  return text;
}
// Guard every asynchronous boundary before opening Files, copying, or sharing.
// Temporary files alone never mean that a destination received the export.
export function reportFiles({current,transport}){
  function check(expected){if(current()!==expected)throw Error('Your account or saved data changed. Review the current preview before exporting.');}
  return {
    async pdf({expected,text,name,scope,attestation,share=false}){
      checkedText(text,REPORT_LIMIT,'This report');check(expected);
      const file=await transport.pdf({text,name,scope,attestation});check(expected);
      if(!file?.uri)throw Error('The PDF file could not be prepared.');
      const result=await (share?transport.share(file.uri,name):transport.save(file.uri,name));check(expected);return result;
    },
    async csv({expected,text,name,scope,share=false}){
      checkedText(text,CSV_LIMIT,'This CSV export');check(expected);
      const file=await transport.csv({text,name,scope});check(expected);
      if(!file?.uri)throw Error('The CSV file could not be prepared.');
      const result=await (share?transport.share(file.uri,name):transport.save(file.uri,name));check(expected);return result;
    },
    async copy({expected,text}){checkedText(text,REPORT_LIMIT,'This report');check(expected);await transport.copy(text);check(expected);}
  };
}
