// Synthetic report QA only; never used to seed normal account records.
import {localDay} from './domain.js';
export const reportProfile={currentParentLabel:'Alex <Parent>',coParentLabel:'Jordan & Co',children:['Avery','Sam'],themeMode:'dark'};
export function reportFixture(){
  const day=n=>{const d=new Date();d.setDate(d.getDate()+n);return localDay(d)},stamp=new Date().toISOString();
  const base={week:'dad',dadMode:'normal',momMode:null,kidsWithDad:['Avery','Sam'],absentData:{},momOpts:[],helpedKids:[],helpedData:{},dadHadKids:[],momHadKidsOnDadWeek:[],momHelpedOnDadWeek:{},diary:'Synthetic note <tags> & punctuation 日本語\n'+'Synthetic narrative preserved exactly on every export.\n'.repeat(50),attachment:null,changeAgreed:null,changePressured:null,loggedAt:stamp};
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
  return {
    [day(0)]:{...base,week:'mom',dadMode:null,momMode:'dad-had',dadHadKids:['Avery','Sam'],changeAgreed:true,changePressured:false},
    [day(-1)]:{...base,dadMode:'mom-had',kidsWithDad:[],momHadKidsOnDadWeek:['Avery'],changeAgreed:true,changePressured:true,attachment:{name:'synthetic.png',type:'image/png',dataUrl:image}},
    [day(-2)]:{...base,kidsWithDad:['Avery'],absentData:{Sam:{location:'sleepover',note:'Synthetic location'}},diary:'START-LONG-NOTE\n'+Array.from({length:45},(_,i)=>'Synthetic line '+i+' - exact note for pagination, including <tags> & punctuation.').join('\n')+'\nEND-LONG-NOTE'},
    [day(-3)]:{week:'not-logged',intentional:true,missedAt:stamp},
    [day(-4)]:{...base,week:'mom',dadMode:null,momMode:'helped',kidsWithDad:[],helpedKids:['Avery','Sam'],helpedData:{Avery:{acts:['school'],note:'Shared help'},Sam:{acts:['school'],note:'Shared help'}}},
    [day(-6)]:{...base,dadMode:'dad-helped-mom',momHadKidsOnDadWeek:['Avery','Sam'],momHelpedOnDadWeek:{Avery:{acts:['medical'],note:'Shared co-parent help'},Sam:{acts:['medical'],note:'Shared co-parent help'}}},
    [day(-40)]:{...base,week:'mom',dadMode:null,momMode:'dad-had',dadHadKids:['Avery'],diary:'OUTSIDE PERIOD'},
    [day(1)]:{...base,week:'mom',dadMode:null,momMode:'dad-had',dadHadKids:['Avery'],diary:'FUTURE RECORD'}
  };
}
