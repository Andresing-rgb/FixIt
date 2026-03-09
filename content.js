chrome.runtime.onMessage.addListener((msg)=>{

if(msg.type!=="INSERT_TEXT") return

const el=document.activeElement

if(!el) return

if(el.tagName==="TEXTAREA"||el.tagName==="INPUT"){

const start=el.selectionStart
const end=el.selectionEnd

el.value=
el.value.slice(0,start)+
msg.text+
el.value.slice(end)

}

})