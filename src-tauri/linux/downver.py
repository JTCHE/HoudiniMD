#!/usr/bin/env python3
"""Point a library's version requirement at an older tag of the same library.

patchelf --clear-symbol-version takes the tag off each symbol, but the file
keeps a separate record saying "I need version GLIBC_2.35 of libm.so.6", and
the loader refuses on that record alone. This rewrites that record to name a
version the older libm does have. Nothing references the old tag by then, so
the symbols bind to the default implementation.

    downver.py <file> <needed-lib> <from-version> <to-version>
"""
import struct
import sys

SHT_GNU_verneed = 0x6FFFFFFE


def elf_hash(name: bytes) -> int:
    h = 0
    for c in name:
        h = (h << 4) + c
        g = h & 0xF0000000
        if g:
            h ^= g >> 24
        h &= ~g & 0xFFFFFFFF
    return h


def main() -> int:
    path, lib, old, new = sys.argv[1:5]
    data = bytearray(open(path, "rb").read())

    if data[:4] != b"\x7fELF" or data[4] != 2:
        print("not a 64-bit ELF")
        return 1

    e_shoff, = struct.unpack_from("<Q", data, 0x28)
    e_shentsize, e_shnum = struct.unpack_from("<HH", data, 0x3A)

    verneed = strtab = None
    for i in range(e_shnum):
        off = e_shoff + i * e_shentsize
        sh_type, = struct.unpack_from("<I", data, off + 4)
        sh_offset, = struct.unpack_from("<Q", data, off + 0x18)
        sh_size, = struct.unpack_from("<Q", data, off + 0x20)
        sh_link, = struct.unpack_from("<I", data, off + 0x28)
        if sh_type == SHT_GNU_verneed:
            verneed = (sh_offset, sh_size, sh_link)
        # .dynstr is the string table the verneed section links to; resolved
        # below once verneed is known.
    if verneed is None:
        print("no .gnu.version_r")
        return 1

    vn_off, vn_size, vn_link = verneed
    link_off = e_shoff + vn_link * e_shentsize
    strtab, = struct.unpack_from("<Q", data, link_off + 0x18)
    strsize, = struct.unpack_from("<Q", data, link_off + 0x20)
    strings = bytes(data[strtab:strtab + strsize])

    def s(at: int) -> bytes:
        end = strings.index(b"\x00", at)
        return strings[at:end]

    # The replacement name must already be in .dynstr: this only retags, it
    # never grows the file.
    marker = new.encode() + b"\x00"
    pos = strings.find(marker)
    if pos == -1 or (pos and strings[pos - 1] != 0):
        # Accept a match that starts right after a NUL, or at offset 0.
        pos = -1
        start = 0
        while True:
            found = strings.find(marker, start)
            if found == -1:
                break
            if found == 0 or strings[found - 1] == 0:
                pos = found
                break
            start = found + 1
    if pos == -1:
        print(f"{new} is not in .dynstr; cannot retag without growing the file")
        return 1

    new_hash = elf_hash(new.encode())
    changed = 0
    p = vn_off
    while True:
        vn_version, vn_cnt, vn_file, vn_aux, vn_next = struct.unpack_from("<HHIII", data, p)
        if s(vn_file).decode(errors="replace") == lib:
            a = p + vn_aux
            while True:
                vna_hash, vna_flags, vna_other, vna_name, vna_next = struct.unpack_from("<IHHII", data, a)
                if s(vna_name).decode(errors="replace") == old:
                    struct.pack_into("<IHHII", data, a, new_hash, vna_flags, vna_other, pos, vna_next)
                    changed += 1
                if vna_next == 0:
                    break
                a += vna_next
        if vn_next == 0:
            break
        p += vn_next

    if not changed:
        print(f"no requirement for {old} of {lib}")
        return 1

    open(path, "wb").write(bytes(data))
    print(f"{path}: {lib} {old} -> {new} ({changed} record)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
