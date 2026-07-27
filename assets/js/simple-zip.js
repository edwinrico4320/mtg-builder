(function () {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255]);
  }

  function u32(value) {
    return new Uint8Array([
      value & 255,
      (value >>> 8) & 255,
      (value >>> 16) & 255,
      (value >>> 24) & 255
    ]);
  }

  function concat(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    parts.forEach(part => {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  }

  function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return {dosTime, dosDate};
  }

  function create(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const now = dosDateTime(new Date());

    files.forEach(file => {
      const name = encoder.encode(file.name.replace(/\\/g, '/'));
      const data = file.content instanceof Uint8Array ? file.content : encoder.encode(String(file.content));
      const crc = crc32(data);
      const local = concat([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),
        u16(now.dosTime), u16(now.dosDate), u32(crc),
        u32(data.length), u32(data.length), u16(name.length), u16(0),
        name, data
      ]);
      locals.push(local);

      const central = concat([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(now.dosTime), u16(now.dosDate), u32(crc),
        u32(data.length), u32(data.length), u16(name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
      ]);
      centrals.push(central);
      offset += local.length;
    });

    const centralData = concat(centrals);
    const end = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralData.length), u32(offset), u16(0)
    ]);

    return new Blob([...locals, centralData, end], {type: 'application/zip'});
  }

  window.SimpleZip = {create};
})();
