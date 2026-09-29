/* Minimal ISO BMFF muxer for one AVC video track, no B-frames, constant frame rate.
   AVC configuration is supplied by WebCodecs; samples are length-prefixed (avc).
   moov precedes mdat for seekable/fast-start playback. No external runtime. */
const u8=(...a)=>new Uint8Array(a),str=s=>new TextEncoder().encode(s),zero=n=>new Uint8Array(n);
function join(...a){a=a.flat();let n=a.reduce((s,b)=>s+b.length,0),o=new Uint8Array(n),p=0;for(const b of a){o.set(b,p);p+=b.length;}return o;}
const u16=n=>u8(n>>>8,n&255),u32=n=>u8(n>>>24,(n>>>16)&255,(n>>>8)&255,n&255);
const box=(type,...data)=>{const body=join(...data);return join(u32(body.length+8),str(type),body);};
const full=(type,version,flags,...data)=>box(type,u8(version,flags>>>16,(flags>>>8)&255,flags&255),...data);
const matrix=join(u32(65536),u32(0),u32(0),u32(0),u32(65536),u32(0),u32(0),u32(0),u32(0x40000000));
export function muxMP4(samples,avcc,width,height,fps){if(!samples.length||!avcc?.byteLength)throw new Error('MP4 인코더가 영상 설정을 반환하지 않았습니다.');const timescale=fps*1000,duration=samples.length*1000,ftyp=box('ftyp',str('isom'),u32(512),str('isomiso2avc1mp41'));
 const moov=offset=>box('moov',
 full('mvhd',0,0,u32(0),u32(0),u32(timescale),u32(duration),u32(65536),u16(256),zero(10),matrix,zero(24),u32(2)),
 box('trak',full('tkhd',0,7,u32(0),u32(0),u32(1),u32(0),u32(duration),zero(8),u16(0),u16(0),u16(0),u16(0),matrix,u32(width*65536),u32(height*65536)),
 box('mdia',full('mdhd',0,0,u32(0),u32(0),u32(timescale),u32(duration),u16(0x55c4),u16(0)),full('hdlr',0,0,u32(0),str('vide'),zero(12),str('J&B Line Cinema\0')),
 box('minf',full('vmhd',0,1,u16(0),zero(6)),box('dinf',full('dref',0,0,u32(1),full('url ',0,1))),
 box('stbl',full('stsd',0,0,u32(1),box('avc1',zero(6),u16(1),zero(16),u16(width),u16(height),u32(72*65536),u32(72*65536),u32(0),u16(1),zero(32),u16(24),u16(65535),box('avcC',new Uint8Array(avcc)))),
 full('stts',0,0,u32(1),u32(samples.length),u32(1000)),full('stsc',0,0,u32(1),u32(1),u32(samples.length),u32(1)),full('stsz',0,0,u32(0),u32(samples.length),...samples.map(s=>u32(s.data.length))),full('stco',0,0,u32(1),u32(offset)),full('stss',0,0,u32(samples.filter(s=>s.key).length),...samples.flatMap((s,i)=>s.key?[u32(i+1)]:[])))))));
 const header=moov(0),finalMoov=moov(ftyp.length+header.length+8),size=samples.reduce((n,s)=>n+s.data.length,0);return new Blob([ftyp,finalMoov,u32(size+8),str('mdat'),...samples.map(s=>s.data)],{type:'video/mp4'});}
