export function renderChat(target,s,call){
 const c=s.chat||{history:[],configured:false};const stamp=JSON.stringify(c);if(target.dataset.stamp===stamp)return;target.dataset.stamp=stamp;
 const draft=target.querySelector('textarea')?.value||'';target.replaceChildren();
 const el=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
 if(!c.configured){const card=el('article','');card.className='chat-guide';card.append(el('h2','先连接你的模型接口'),el('p','填写接口地址、API Key 和模型名后，就可以在这里聊天。此处不连接肖大大本人的记忆与会话。'));const b=el('button','去聊天设置');b.onclick=()=>call('chat-settings');card.append(b);target.append(card);return;}
 const list=el('div','');list.className='chat-messages';list.setAttribute('aria-live','polite');for(const row of c.history){const b=el('p',row.content);b.className='chat-bubble '+row.role;list.append(b);}if(c.busy)list.append(el('p','想想哦……'));target.append(list);
 const form=el('form',''),input=el('textarea','');input.value=draft;input.maxLength=8000;input.rows=2;input.placeholder='说点什么吧';input.setAttribute('aria-label','聊天消息');const send=el('button',c.busy?'等待接口回复':'发送');send.disabled=c.busy;form.append(input,send);form.onsubmit=async e=>{e.preventDefault();const value=input.value;if(!value.trim())return;input.value='';const r=await call('chat-send',value);if(r?.ok===false){input.value=value;const error=el('p',r.message);error.setAttribute('role','alert');form.append(error);}};target.append(form);list.scrollTop=list.scrollHeight;
}
