import {imageSize} from 'image-size';
import {HTTPException} from 'hono/http-exception';
const maximum=5*1024*1024;
export async function readGraphic(req:Request){
 const mime=req.headers.get('content-type');
 if(mime!=='image/png'&&mime!=='image/jpeg')throw new HTTPException(415,{message:'Choose a PNG or JPEG image.'});
 const reader=req.body?.getReader();
 if(!reader)throw new HTTPException(400,{message:'The image is empty.'});
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){await reader.cancel();throw new HTTPException(413,{message:'The maximum image size is 5 MB.'})}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try {
  const {width,height,type}=imageSize(bytes);
  const png=mime==='image/png';
  const tail=png?[0,0,0,0,73,69,78,68,174,66,96,130]:[255,217];
  if(type!==(png?'png':'jpg')||!tail.every((b,i)=>bytes[size-tail.length+i]===b)||!width||!height||width>8192||height>8192||width*height>25000000)throw new Error();
  return {bytes,width,height,mime};
 } catch {throw new HTTPException(422,{message:'Invalid or truncated graphic. Use PNG or JPEG up to 8,192 px per side and 25 megapixels.'})}
}
