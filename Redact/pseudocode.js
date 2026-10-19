/* Redact extension: Pseudocode (Cambridge International AS & A Level 9618)
   - Syntax colouring for documents named *.pseudo (or .pcode, .psc, .pseudocode)
   - Writing aids: "<-" becomes ←, insert constructs, re-indent, UPPERCASE keywords
   - Run: translates the pseudocode to JavaScript and runs it in the browser, with a console for INPUT/OUTPUT
   Follows the notation in the 9618 Pseudocode Guide (variables, arrays, records, enums, pointers, sets,
   IF/CASE/FOR/WHILE/REPEAT, procedures/functions with BYVAL/BYREF, text and random files, classes).
   Honest limits: no static type checking (INPUT uses declared types); enumerated values are numbers;
   PRIVATE is not enforced; files live in this browser only (text files persist, random files last for the session);
   extra helpers LEFT, ASC, CHR and ROUND are provided beyond the guide. */
editor.registerExtension({
  id: "pseudocode",
  name: "Pseudocode (Cambridge 9618)",
  version: "1.0.0",
  author: "Redact user",
  description: "Write, colour and run Cambridge 9618 pseudocode by translating it to JavaScript. Use files ending in .pseudo.",
  activate(api) {
    let cleanup = () => {};
    const KW = new Set("DECLARE CONSTANT TYPE ENDTYPE SET OF DEFINE ARRAY IF THEN ELSE ENDIF CASE OTHERWISE ENDCASE FOR TO STEP NEXT WHILE ENDWHILE REPEAT UNTIL PROCEDURE ENDPROCEDURE FUNCTION ENDFUNCTION RETURNS RETURN CALL BYVAL BYREF INPUT OUTPUT OPENFILE CLOSEFILE READFILE WRITEFILE SEEK GETRECORD PUTRECORD READ WRITE APPEND RANDOM CLASS ENDCLASS INHERITS PUBLIC PRIVATE NEW SUPER AND OR NOT DIV MOD IN".split(" "));
    const TY = new Set("INTEGER REAL CHAR STRING BOOLEAN DATE".split(" "));
    const BI = new Set("RIGHT LEFT LENGTH MID LCASE UCASE INT RAND EOF ASC CHR ROUND".split(" "));
    const STMT = new Set("DECLARE CONSTANT TYPE DEFINE IF CASE FOR WHILE REPEAT PROCEDURE FUNCTION CALL RETURN INPUT OUTPUT OPENFILE CLOSEFILE READFILE WRITEFILE SEEK GETRECORD PUTRECORD CLASS PUBLIC PRIVATE".split(" "));
    const STRAY = new Set("ENDIF ELSE NEXT ENDWHILE UNTIL ENDCASE ENDPROCEDURE ENDFUNCTION ENDTYPE ENDCLASS".split(" "));
    const isPc = d => /\.(pseudo|pcode|psc|pseudocode)$/i.test(d.name);
    const mkErr = (m, line) => Object.assign(new Error(m), { line });

    /* ================= Lexer ================= */
    const LEX = [[/\/\/.*/y, null], [/\d\d\/\d\d\/\d{4}/y, "d"], [/\d+\.\d+|\d+/y, "n"], [/"[^"]*"|“[^”]*”/y, "s"],
      [/['ꞌ‘’][^'ꞌ‘’]['ꞌ‘’]/y, "c"], [/[A-Za-z_]\w*/y, "i"], [/<-|<>|<=|>=|[←≤≥≠]|[-+*\/&=<>()\[\],.^:–−]/y, "o"]];
    function lex(s, n) {
      const t = []; let i = 0;
      while (i < s.length) {
        if (/\s/.test(s[i])) { i++; continue; }
        let hit = false;
        for (const [re, k] of LEX) {
          re.lastIndex = i; const m = re.exec(s); if (!m) continue;
          hit = true; i = re.lastIndex; if (k === null) { i = s.length; break; }
          let v = m[0];
          if (k === "s") v = v.slice(1, -1); else if (k === "c") v = v[1];
          else if (k === "o") v = { "←": "<-", "≤": "<=", "≥": ">=", "≠": "<>", "–": "-", "−": "-" }[v] || v;
          t.push({ k: k === "c" ? "s" : k, v, u: k === "i" ? v.toUpperCase() : null }); break;
        }
        if (!hit) throw mkErr('Unexpected character "' + s[i] + '"', n);
      }
      return t;
    }

    /* ================= Parser: pseudocode -> AST ================= */
    function parse(src) {
      const L = []; src.replace(/\r\n?/g, "\n").split("\n").forEach((s, i) => { const t = lex(s, i + 1); if (t.length) L.push({ n: i + 1, t }); });
      let li = 0, T = [], p = 0, inCls = false;
      const main = { decl: new Map(), asg: new Set() }; let cs = main;
      const P = { types: {}, classes: {}, sigs: {}, msig: {}, consts: new Set(), main };
      const fail = m => { throw mkErr(m, (L[Math.min(li, L.length - 1)] || { n: 1 }).n); };
      const isO = v => T[p] && T[p].k === "o" && T[p].v === v, isK = u => T[p] && T[p].k === "i" && T[p].u === u;
      const eatO = v => isO(v) && ++p, eatK = u => isK(u) && ++p;
      const needO = v => { if (!eatO(v)) fail('Expected "' + v + '"'); };
      const needK = u => { if (!eatK(u)) fail("Expected " + u); };
      const needId = () => { const t = T[p]; if (!t || t.k !== "i") fail("Expected a name"); p++; return t; };
      const done = () => { if (p < T.length) fail('Unexpected "' + T[p].v + '"'); li++; };
      const closer = (ends, n0) => { if (li >= L.length || !ends.includes(L[li].t[0].u)) throw mkErr("Missing " + ends[0] + " (the block starting here is never closed)", n0); li++; };
      const root = a => a.k === "id" ? a.n : a.k === "idx" || a.k === "fld" ? root(a.o) : null;
      const note = lv => { const r = root(lv); if (r) cs.asg.add(r); };

      const BIN = { OR: 1, AND: 2, "=": 4, "<>": 4, "<": 4, ">": 4, "<=": 4, ">=": 4, IN: 4, "+": 5, "-": 5, "&": 5, "*": 6, "/": 6, DIV: 6, MOD: 6 };
      function expr(min = 1) {
        let l = unary();
        for (;;) {
          const t = T[p]; if (!t) break;
          const key = t.k === "o" ? t.v : t.k === "i" ? t.u : ""; const pr = BIN[key];
          if (!pr || pr < min) break; p++; l = { k: "bin", op: key, l, r: expr(pr + 1) };
        }
        return l;
      }
      function unary() {
        if (!T[p]) fail("The line ends too soon");
        if (isO("-")) { p++; return { k: "neg", e: unary() }; }
        if (isO("^")) { p++; return { k: "addr", e: unary() }; }
        if (isK("NOT")) { p++; return { k: "not", e: expr(4) }; }
        return post();
      }
      const args = () => { const a = []; if (!eatO(")")) { do a.push(expr()); while (eatO(",")); needO(")"); } return a; };
      function post() {
        let e = prim();
        for (;;) {
          if (eatO("[")) { const ix = []; do ix.push(expr()); while (eatO(",")); needO("]"); e = { k: "idx", o: e, i: ix }; }
          else if (eatO(".")) { const t = needId(); e = eatO("(") ? { k: "mcall", o: e, n: t.v.toLowerCase(), a: args() } : { k: "fld", o: e, n: t.v.toLowerCase() }; }
          else if (eatO("^")) e = { k: "deref", e };
          else break;
        }
        return e;
      }
      function prim() {
        const t = T[p++]; if (!t) fail("The line ends too soon");
        if (t.k === "n") return { k: "n", v: t.v };
        if (t.k === "s" || t.k === "d") return { k: "s", v: t.v };
        if (t.k === "o" && t.v === "(") { const e = expr(); needO(")"); return e; }
        if (t.k === "i") {
          if (t.u === "TRUE" || t.u === "FALSE") return { k: "b", v: t.u === "TRUE" };
          if (t.u === "NEW") { const c = needId(); return { k: "new", c: c.v.toLowerCase(), a: eatO("(") ? args() : [] }; }
          if (eatO("(")) return { k: "call", n: t.v.toLowerCase(), u: t.u, a: args() };
          return { k: "id", n: t.v.toLowerCase(), raw: t.v };
        }
        fail('Unexpected "' + t.v + '"');
      }
      function ptype() {
        if (isK("ARRAY")) {
          p++; needO("["); const b = [];
          do { const lo = expr(); needO(":"); b.push([lo, expr()]); } while (eatO(","));
          needO("]"); needK("OF"); return { arr: b, of: ptype() };
        }
        const t = needId(); return TY.has(t.u) ? t.u : t.v.toLowerCase();
      }
      function decl() {
        const names = []; do names.push(needId().v.toLowerCase()); while (eatO(","));
        needO(":"); const type = ptype(); names.forEach(n => cs.decl.set(n, type)); return { type, names };
      }
      const endU = () => (L[li] && L[li].t[0].k === "i" ? L[li].t[0].u : "");
      function block(ends) { const out = []; while (li < L.length) { if (ends.includes(endU())) break; out.push(stmt()); } return out; }
      const isBranch = r => { const f = r.t[0], u = f.k === "i" ? f.u : ""; return u === "OTHERWISE" || (!STMT.has(u) && !STRAY.has(u) && r.t.some((t, i) => i > 0 && t.k === "o" && t.v === ":")); };
      function branch() {
        T = L[li].t; p = 0; let vals = null;
        if (isK("OTHERWISE")) p++; else { vals = []; do { const lo = expr(); vals.push({ lo, hi: eatK("TO") ? expr() : null }); } while (eatO(",")); }
        needO(":"); const body = [];
        if (p < T.length) body.push(stmt(p)); else li++;
        while (li < L.length && !isBranch(L[li]) && endU() !== "ENDCASE") body.push(stmt());
        return { vals, body };
      }
      function routine(kind) {
        const n = L[li].n; p++; const name = needId().v.toLowerCase(), params = []; let ref = false;
        if (eatO("(") && !eatO(")")) {
          do { if (eatK("BYREF")) ref = true; else if (eatK("BYVAL")) ref = false; const id = needId(); needO(":"); params.push({ n: id.v.toLowerCase(), ref, type: ptype() }); } while (eatO(","));
          needO(")");
        }
        let ret = null; if (kind === "FUNCTION") { needK("RETURNS"); ret = ptype(); }
        done(); const saved = cs; cs = { decl: new Map(), asg: new Set() };
        const body = block(["END" + kind]); closer(["END" + kind], n);
        const r = { k: "routine", n, kind, name, params, ret, body, set: cs }; cs = saved;
        (inCls ? P.msig : P.sigs)[name] = params; return r;
      }
      function stmt(sp = 0) {
        const row = L[li]; T = row.t; p = sp; const n = row.n, lead = T[p];
        let u = lead.k === "i" ? lead.u : "", acc = false;
        if (u === "PUBLIC" || u === "PRIVATE") { acc = true; p++; u = T[p] && T[p].k === "i" ? T[p].u : ""; }
        if (acc && T[p] && T[p].k === "i" && T[p + 1] && T[p + 1].v === ":" && !STMT.has(u)) { const d = decl(); done(); return { k: "decl", n, ...d }; }
        if (STRAY.has(u)) fail(u + " has no matching start");
        switch (u) {
          case "DECLARE": { p++; const d = decl(); done(); return { k: "decl", n, ...d }; }
          case "CONSTANT": { p++; const id = needId().v.toLowerCase(); needO("="); const e = expr(); done(); cs.decl.set(id, null); P.consts.add(id); return { k: "const", n, name: id, e }; }
          case "DEFINE": { p++; const id = needId().v.toLowerCase(); needO("("); const v = []; do v.push(expr()); while (eatO(",")); needO(")"); needO(":"); const t = ptype(); done(); cs.decl.set(id, t); return { k: "define", n, name: id, v }; }
          case "TYPE": {
            p++; const name = needId().v.toLowerCase();
            if (eatO("=")) {
              if (eatO("(")) { const v = []; do v.push(needId().v.toLowerCase()); while (eatO(",")); needO(")"); P.types[name] = { k: "enum", vals: v }; v.forEach(x => P.consts.add(x)); }
              else if (eatO("^")) P.types[name] = { k: "ptr", to: ptype() };
              else if (eatK("SET")) { needK("OF"); P.types[name] = { k: "set", of: ptype() }; }
              else fail("This TYPE definition is not supported");
              done(); return { k: "nop", n };
            }
            done(); const fields = [], sv = cs; cs = { decl: new Map(), asg: new Set() };
            while (li < L.length && endU() !== "ENDTYPE") { const s = stmt(); if (s.k !== "decl") fail("Only DECLARE lines can go inside TYPE"); s.names.forEach(nm => fields.push([nm, s.type])); }
            cs = sv; closer(["ENDTYPE"], n); P.types[name] = { k: "rec", fields }; return { k: "nop", n };
          }
          case "CLASS": {
            p++; const name = needId().v.toLowerCase(); let parent = null; if (eatK("INHERITS")) parent = needId().v.toLowerCase(); done();
            const c = { k: "class", n, name, parent, fields: new Map(), methods: [] }; P.classes[name] = c;
            const sv = cs, svc = inCls; cs = { decl: new Map(), asg: new Set() }; inCls = true;
            while (li < L.length && endU() !== "ENDCLASS") {
              const s = stmt();
              if (s.k === "decl") s.names.forEach(nm => c.fields.set(nm, s.type)); else if (s.k === "routine") c.methods.push(s); else fail("Only fields and methods can go inside a CLASS");
            }
            cs = sv; inCls = svc; closer(["ENDCLASS"], n); return c;
          }
          case "PROCEDURE": case "FUNCTION": return routine(u);
          case "IF": {
            p++; const c = expr(); needK("THEN"); done(); const a = block(["ELSE", "ENDIF"]); let b = null;
            if (endU() === "ELSE") { T = L[li].t; p = 1; done(); b = block(["ENDIF"]); }
            closer(["ENDIF"], n); return { k: "if", n, c, a, b };
          }
          case "CASE": {
            p++; needK("OF"); const e = expr(); done(); const br = [];
            while (li < L.length && endU() !== "ENDCASE") { if (!isBranch(L[li])) fail("Expected a value followed by : inside CASE"); br.push(branch()); }
            closer(["ENDCASE"], n); return { k: "case", n, e, br };
          }
          case "FOR": {
            p++; const v = post(); needO("<-"); const a = expr(); needK("TO"); const b = expr(), s = eatK("STEP") ? expr() : null; done(); note(v);
            const body = block(["NEXT"]); closer(["NEXT"], n); return { k: "for", n, v, a, b, s, body };
          }
          case "WHILE": { p++; const c = expr(); done(); const body = block(["ENDWHILE"]); closer(["ENDWHILE"], n); return { k: "while", n, c, body }; }
          case "REPEAT": {
            p++; done(); const body = block(["UNTIL"]); if (endU() !== "UNTIL") throw mkErr("Missing UNTIL (the REPEAT starting here is never closed)", n);
            T = L[li].t; p = 1; const c = expr(); done(); return { k: "repeat", n, c, body };
          }
          case "CALL": { p++; const e = post(); done(); return { k: "cs", n, e }; }
          case "RETURN": { p++; const e = p < T.length ? expr() : null; done(); return { k: "return", n, e }; }
          case "INPUT": { p++; const lvs = []; do { const lv = post(); note(lv); lvs.push(lv); } while (eatO(",")); done(); return { k: "input", n, lvs }; }
          case "OUTPUT": { p++; const es = []; do es.push(expr()); while (eatO(",")); done(); return { k: "output", n, es }; }
          case "OPENFILE": { p++; const f = expr(); needK("FOR"); const m = needId().u; if (!["READ", "WRITE", "APPEND", "RANDOM"].includes(m)) fail("File mode must be READ, WRITE, APPEND or RANDOM"); done(); return { k: "open", n, f, m }; }
          case "CLOSEFILE": { p++; const f = expr(); done(); return { k: "closef", n, f }; }
          case "READFILE": case "GETRECORD": { p++; const f = expr(); needO(","); const lv = post(); note(lv); done(); return { k: u === "READFILE" ? "readf" : "getr", n, f, lv }; }
          case "WRITEFILE": case "PUTRECORD": { p++; const f = expr(); needO(","); const e = expr(); done(); return { k: u === "WRITEFILE" ? "writef" : "putr", n, f, e }; }
          case "SEEK": { p++; const f = expr(); needO(","); const e = expr(); done(); return { k: "seek", n, f, e }; }
        }
        const lv = post();
        if (eatO("<-")) { const e = expr(); done(); note(lv); return { k: "assign", n, lv, e }; }
        if (lv.k === "call" || lv.k === "mcall") { done(); return { k: "cs", n, e: lv }; }
        fail("This line is not a statement I understand");
      }
      const body = block([]);
      return { P, body, main };
    }

    /* ================= Code generator: AST -> JavaScript ================= */
    function generate({ P, body, main }) {
      const sc = [new Map()]; let cls = null, cur = 0, uid = 0; const fns = [], classes = [];
      const err = m => mkErr(m, cur);
      const look = n => { for (let i = sc.length - 1; i >= 0; i--) if (sc[i].has(n)) return sc[i].get(n); return null; };
      const need = a => { const i = look(a.n); if (!i) throw err('"' + (a.raw || a.n) + '" has not been declared or given a value'); return i; };
      const def = t => {
        if (t && t.arr) return "new $Arr([" + t.arr.map(b => "[" + E(b[0]) + "," + E(b[1]) + "]").join(",") + "],()=>" + def(t.of) + ")";
        switch (t) { case "INTEGER": case "REAL": return "0"; case "CHAR": return '" "'; case "STRING": case "DATE": return '""'; case "BOOLEAN": return "false"; }
        const d = P.types[t]; if (!d) return "null";
        return d.k === "rec" ? "$T." + t + "()" : d.k === "enum" ? "0" : d.k === "set" ? "new Set()" : "null";
      };
      const ty = a => {
        if (a.k === "id") { const i = look(a.n); return i && i.type; }
        if (a.k === "idx") { const t = ty(a.o); return t && t.arr ? t.of : null; }
        if (a.k === "fld") { const t = ty(a.o), d = typeof t === "string" && P.types[t]; const f = d && d.fields && d.fields.find(x => x[0] === a.n); return f ? f[1] : null; }
        return null;
      };
      const argList = (params, a, name) => {
        if (!params) params = a.map(() => ({ ref: false }));
        if (params.length !== a.length) throw err(name + " needs " + params.length + " value(s) but was given " + a.length);
        return params.map((pm, i) => pm.ref ? ptr(a[i]) : "$cp(" + E(a[i]) + ")").join(",");
      };
      function ptr(lv) {
        if (!["id", "idx", "fld", "deref"].includes(lv.k)) throw err("A BYREF value must be a variable");
        if (lv.k === "id" && need(lv).k === "ref") return "v_" + lv.n;
        return "new $Ptr(()=>" + E(lv) + ",($v)=>" + setv(lv, "$v") + ")";
      }
      function setv(lv, val) {
        switch (lv.k) {
          case "id": { const i = need(lv); if (i.k === "c") throw err("You cannot change the constant " + lv.raw); return i.k === "ref" ? "v_" + lv.n + ".set(" + val + ")" : i.k === "f" ? "(this.f_" + lv.n + "=" + val + ")" : "(v_" + lv.n + "=" + val + ")"; }
          case "idx": return E(lv.o) + ".set(" + [...lv.i.map(E), val].join(",") + ")";
          case "fld": return "(" + E(lv.o) + ".f_" + lv.n + "=" + val + ")";
          case "deref": return E(lv.e) + ".set(" + val + ")";
        }
        throw err("The left side of ← must be a variable");
      }
      function E(a) {
        switch (a.k) {
          case "n": return a.v;
          case "s": return JSON.stringify(a.v);
          case "b": return String(a.v);
          case "neg": return "(-" + E(a.e) + ")";
          case "not": return "(!" + E(a.e) + ")";
          case "id": { const i = need(a); return i.k === "ref" ? "v_" + a.n + ".get()" : i.k === "f" ? "this.f_" + a.n : "v_" + a.n; }
          case "idx": return E(a.o) + ".get(" + a.i.map(E).join(",") + ")";
          case "fld": return E(a.o) + ".f_" + a.n;
          case "deref": return E(a.e) + ".get()";
          case "addr": return ptr(a.e);
          case "new": if (!P.classes[a.c]) throw err('Unknown class "' + a.c + '"'); return "(await $new(c_" + a.c + ",[" + a.a.map(x => "$cp(" + E(x) + ")").join(",") + "]))";
          case "call":
            if (cls && cls.methods.has(a.n)) return "(await this.m_" + a.n + "(" + argList(P.msig[a.n], a.a, a.u) + "))";
            if (P.sigs[a.n]) return "(await f_" + a.n + "(" + argList(P.sigs[a.n], a.a, a.u) + "))";
            if (BI.has(a.u)) return "$b." + a.u + "(" + a.a.map(E).join(",") + ")";
            throw err('Unknown procedure or function "' + a.u + '"');
          case "mcall": return "(await " + (a.o.k === "id" && a.o.n === "super" ? "super" : E(a.o)) + ".m_" + a.n + "(" + argList(P.msig[a.n], a.a, a.n) + "))";
          case "bin": {
            const l = E(a.l), r = E(a.r);
            switch (a.op) {
              case "AND": return "(" + l + "&&" + r + ")"; case "OR": return "(" + l + "||" + r + ")";
              case "=": return "(" + l + "===" + r + ")"; case "<>": return "(" + l + "!==" + r + ")";
              case "/": return "$d(" + l + "," + r + ")"; case "DIV": return "$div(" + l + "," + r + ")"; case "MOD": return "$mod(" + l + "," + r + ")";
              case "&": return "$cat(" + l + "," + r + ")"; case "IN": return r + ".has(" + l + ")";
              default: return "(" + l + a.op + r + ")";
            }
          }
        }
        throw err("Cannot translate this expression");
      }
      const tick = "if(++$r.c%500===0)await $r.y();";
      const S = list => list.map(st => { cur = st.n; return G(st); }).join("");
      function G(st) {
        const L = st.k === "nop" || st.k === "routine" || st.k === "class" ? "" : "$r.l=" + st.n + ";";
        switch (st.k) {
          case "nop": return "";
          case "decl": return L + st.names.map(n => { look(n).type = st.type; return setv({ k: "id", n, raw: n }, def(st.type)) + ";"; }).join("");
          case "const": return L + "v_" + st.name + "=" + E(st.e) + ";";
          case "define": return L + "v_" + st.name + "=new Set([" + st.v.map(E).join(",") + "]);";
          case "assign": return L + setv(st.lv, "$cp(" + E(st.e) + ")") + ";";
          case "cs": { let e = st.e; if (e.k === "id") e = { k: "call", n: e.n, u: e.raw.toUpperCase(), a: [] }; if (e.k !== "call" && e.k !== "mcall") throw err("CALL needs a procedure name"); return L + E(e) + ";"; }
          case "input": return L + st.lvs.map(lv => { const t = ty(lv), r = lv.k === "id" ? lv.raw : "value"; return setv(lv, "await $r.inp(" + JSON.stringify(r) + "," + JSON.stringify(typeof t === "string" ? t : "") + ")") + ";"; }).join("");
          case "output": return L + "$r.out([" + st.es.map(E).join(",") + "]);";
          case "if": return L + "if(" + E(st.c) + "){" + S(st.a) + "}" + (st.b ? "else{" + S(st.b) + "}" : "");
          case "case": {
            const v = "$c" + (++uid); let s = L + "{const " + v + "=" + E(st.e) + ";", first = true, other = null;
            st.br.forEach(b => {
              if (!b.vals) { other = b; return; }
              const cond = b.vals.map(x => x.hi ? "(" + v + ">=" + E(x.lo) + "&&" + v + "<=" + E(x.hi) + ")" : v + "===" + E(x.lo)).join("||");
              s += (first ? "" : "else ") + "if(" + cond + "){" + S(b.body) + "}"; first = false;
            });
            if (other) s += (first ? "{" : "else{") + S(other.body) + "}";
            return s + "}";
          }
          case "for": {
            const id = ++uid, e = "$e" + id, s = "$s" + id, g = E(st.v);
            return L + "{const " + e + "=" + E(st.b) + "," + s + "=" + (st.s ? E(st.s) : "1") + ";if(!" + s + ")throw new Error('STEP cannot be 0');for(" + setv(st.v, E(st.a)) + ";" + s + ">0?" + g + "<=" + e + ":" + g + ">=" + e + ";" + setv(st.v, g + "+" + s) + "){" + tick + S(st.body) + "}}";
          }
          case "while": return L + "while(" + E(st.c) + "){" + tick + S(st.body) + "}";
          case "repeat": return L + "do{" + tick + S(st.body) + "}while(!" + E(st.c) + ");";
          case "return": return L + "return" + (st.e ? " $cp(" + E(st.e) + ")" : "") + ";";
          case "open": return L + "$F.open(" + E(st.f) + ",'" + st.m + "');";
          case "closef": return L + "$F.close(" + E(st.f) + ");";
          case "readf": return L + setv(st.lv, "$F.read(" + E(st.f) + ")") + ";";
          case "writef": return L + "$F.write(" + E(st.f) + ",$fmt(" + E(st.e) + "));";
          case "seek": return L + "$F.seek(" + E(st.f) + "," + E(st.e) + ");";
          case "getr": return L + setv(st.lv, "$cp($F.get(" + E(st.f) + "))") + ";";
          case "putr": return L + "$F.put(" + E(st.f) + ",$cp(" + E(st.e) + "));";
          case "routine": fns.push(routineText(st, false)); return "";
          case "class": return "";
        }
        throw err("Cannot translate statement " + st.k);
      }
      function routineText(r, isM) {
        cur = r.n; const loc = new Map(), hoist = [];
        r.params.forEach(pm => loc.set(pm.n, { k: pm.ref ? "ref" : "v", type: pm.type }));
        r.set.decl.forEach((t, n) => { if (!loc.has(n)) { loc.set(n, { k: P.consts.has(n) ? "c" : "v", type: t }); hoist.push(n); } });
        r.set.asg.forEach(n => {
          if (loc.has(n)) return; const g = look(n);
          if (g && (g.k === "f" || g.k === "c" || main.decl.has(n))) return;
          loc.set(n, { k: "v", type: null }); hoist.push(n);
        });
        sc.push(loc); const b = S(r.body); sc.pop();
        const params = r.params.map(x => "v_" + x.n).join(",");
        return (isM ? "async m_" + r.name : "async function f_" + r.name) + "(" + params + "){" + (hoist.length ? "let " + hoist.map(n => "v_" + n).join(",") + ";" : "") + b + "}";
      }
      function classText(c) {
        const par = c.parent ? P.classes[c.parent] : null; cur = c.n;
        if (c.parent && (!par || !par.all)) throw err('The parent class "' + c.parent + '" must be defined before "' + c.name + '"');
        const fields = new Map(par ? par.all.fields : []); c.fields.forEach((t, n) => fields.set(n, t));
        const methods = new Set(par ? par.all.methods : []); c.methods.forEach(m => methods.add(m.name)); c.all = { fields, methods };
        const fm = new Map(); fields.forEach((t, n) => fm.set(n, { k: "f", type: t })); sc.push(fm); cls = c.all;
        const ctor = "constructor(){" + (par ? "super();" : "") + [...c.fields].map(([n, t]) => "this.f_" + n + "=" + def(t) + ";").join("") + "}";
        const ms = c.methods.map(m => routineText(m, true)).join(""); sc.pop(); cls = null;
        return "class c_" + c.name + (par ? " extends c_" + par.name : "") + "{" + ctor + ms + "}";
      }
      // global scope: declared names, automatic variables, constants, enumerated values
      const g = sc[0], head = [];
      main.decl.forEach((t, n) => g.set(n, { k: P.consts.has(n) ? "c" : "v", type: t }));
      main.asg.forEach(n => { if (!g.has(n)) g.set(n, { k: "v", type: null }); });
      Object.values(P.types).forEach(d => { if (d.k === "enum") d.vals.forEach((v, i) => { g.set(v, { k: "c" }); head.push("const v_" + v + "=" + i + ";"); }); });
      Object.entries(P.types).forEach(([n, d]) => { if (d.k === "rec") head.push("$T." + n + "=()=>$mk({" + d.fields.map(([f, t]) => "f_" + f + ":" + def(t)).join(",") + "});"); });
      const mainJs = S(body);
      Object.values(P.classes).forEach(c => classes.push(classText(c)));
      const lets = [...g.keys()].filter(n => !(P.types && Object.values(P.types).some(d => d.k === "enum" && d.vals.includes(n)))).map(n => "v_" + n);
      return "const {Arr:$Arr,Ptr:$Ptr,cp:$cp,mk:$mk,d:$d,div:$div,mod:$mod,cat:$cat,fmt:$fmt,b:$b,F:$F,new:$new}=RT;const $T={};" +
        head.join("") + classes.join("") + (lets.length ? "let " + lets.join(",") + ";" : "") + fns.join("") + mainJs;
    }
    const compile = src => generate(parse(src));

    /* ================= Runtime ================= */
    class PArr {
      constructor(b, fn) { this.b = b; this.m = new Map(); this.fn = fn; }
      k(ix) {
        if (ix.length !== this.b.length) throw new Error("This array needs " + this.b.length + " index value(s)");
        ix.forEach((v, i) => { if (!Number.isInteger(v) || v < this.b[i][0] || v > this.b[i][1]) throw new Error("Array index " + v + " is outside " + this.b[i][0] + ":" + this.b[i][1]); });
        return ix.join(",");
      }
      get(...ix) { const k = this.k(ix); if (!this.m.has(k)) this.m.set(k, this.fn()); return this.m.get(k); }
      set(...a) { const v = a.pop(); this.m.set(this.k(a), v); }
      clone() { const c = new PArr(this.b, this.fn); for (const [k, v] of this.m) c.m.set(k, cp(v)); return c; }
    }
    class PRec {}
    class PPtr { constructor(g, s) { this.get = g; this.set = s; } }
    const cp = v => v instanceof PArr ? v.clone() : v instanceof Set ? new Set(v) : v instanceof PRec ? Object.assign(new PRec(), Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cp(x)]))) : v;
    const fmt = v => v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v instanceof PArr ? "[array]" : String(v);
    const str = s => { if (typeof s !== "string") throw new Error("A STRING is needed here"); return s; };
    const B = {
      RIGHT: (s, x) => str(s).slice(Math.max(0, s.length - x)), LEFT: (s, x) => str(s).slice(0, x), LENGTH: s => str(s).length,
      MID: (s, x, y) => { if (x < 1) throw new Error("MID starts at position 1"); return str(s).substr(x - 1, y); },
      LCASE: c => str(c).toLowerCase(), UCASE: c => str(c).toUpperCase(), INT: x => Math.trunc(x), RAND: x => Math.random() * x,
      ASC: c => str(c).charCodeAt(0), CHR: n => String.fromCharCode(n), ROUND: (x, n) => Number(x.toFixed(n)),
      EOF: f => FS.eof(f)
    };
    const FS = (() => {
      const KEY = "redact.pcfiles"; let t = {}; try { t = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
      const rnd = new Map(), open = new Map();
      const save = () => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) {} };
      const get = f => { const o = open.get(f); if (!o) throw new Error('File "' + f + '" is not open: use OPENFILE first'); return o; };
      return {
        clear() { t = {}; rnd.clear(); save(); }, names: () => Object.keys(t),
        open(f, m) {
          if (open.has(f)) throw new Error('File "' + f + '" is already open');
          if (m === "RANDOM") { if (!rnd.has(f)) rnd.set(f, []); open.set(f, { m, recs: rnd.get(f), ptr: 0 }); return; }
          if (m === "READ") { if (!(f in t)) throw new Error('File "' + f + '" was not found. Files exist only in this browser; create it with WRITE first.'); open.set(f, { m, lines: t[f] === "" ? [] : t[f].split("\n"), pos: 0 }); return; }
          if (m === "WRITE") { t[f] = ""; save(); open.set(f, { m, lines: [] }); return; }
          open.set(f, { m, lines: f in t && t[f] !== "" ? t[f].split("\n") : [] });
        },
        close(f) { get(f); open.delete(f); },
        read(f) { const o = get(f); if (o.m !== "READ") throw new Error("The file is not open for READ"); if (o.pos >= o.lines.length) throw new Error("Tried to read past the end of " + f); return o.lines[o.pos++]; },
        eof(f) { const o = get(f); return o.pos >= o.lines.length; },
        write(f, s) { const o = get(f); if (o.m !== "WRITE" && o.m !== "APPEND") throw new Error("The file is not open for WRITE or APPEND"); o.lines.push(s); t[f] = o.lines.join("\n"); save(); },
        seek(f, a) { const o = get(f); if (o.m !== "RANDOM") throw new Error("SEEK needs a RANDOM file"); o.ptr = a; },
        get(f) { const o = get(f); const r = o.recs[o.ptr]; if (r === undefined) throw new Error("No record at address " + o.ptr); return r; },
        put(f, v) { const o = get(f); o.recs[o.ptr] = v; }
      };
    })();
    const RT = {
      Arr: PArr, Ptr: PPtr, cp, mk: o => Object.assign(new PRec(), o), fmt, b: B, F: FS,
      d: (a, b) => { if (b === 0) throw new Error("Division by zero"); return a / b; },
      div: (a, b) => { if (b === 0) throw new Error("Division by zero"); return Math.trunc(a / b); },
      mod: (a, b) => { if (b === 0) throw new Error("Division by zero"); return a % b; },
      cat: (a, b) => fmt(a) + fmt(b),
      new: async (C, a) => { const o = new C(); if (o.m_new) await o.m_new(...a); return o; }
    };
    const convert = (s, t) => {
      switch (t) {
        case "INTEGER": return /^\s*[-+]?\d+\s*$/.test(s) ? parseInt(s, 10) : undefined;
        case "REAL": return /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(s) ? parseFloat(s) : undefined;
        case "BOOLEAN": { const u = s.trim().toUpperCase(); return u === "TRUE" ? true : u === "FALSE" ? false : undefined; }
        case "CHAR": return s.length === 1 ? s : undefined;
        case "STRING": case "DATE": return s;
        default: return /^\s*[-+]?\d+(\.\d+)?\s*$/.test(s) ? parseFloat(s) : s;
      }
    };
    /* Run compiled code. io = { out(text), ask(label) -> Promise<string|null>, stopped() } */
    async function execute(code, io) {
      const $r = {
        l: 0, c: 0,
        out: a => io.out(a.map(fmt).join("") + "\n"),
        y: async () => { if (io.stopped()) throw new Error("Stopped"); await new Promise(r => setTimeout(r)); },
        inp: async (label, type) => {
          for (;;) {
            const s = await io.ask(label); if (s === null || io.stopped()) throw new Error("Stopped");
            const v = convert(s, type); if (v !== undefined) return v;
            io.out("That is not a valid " + type + ". Try again.\n");
          }
        }
      };
      try { await new Function("RT", "$r", "return (async()=>{" + code + "\n})()")(RT, $r); return null; }
      catch (e) { return { line: $r.l, message: e.message, stopped: e.message === "Stopped" }; }
    }
    editor.pseudocode = { compile, execute, parse };

    /* ================= Writing aids ================= */
    const reindent = src => { let lvl = 0; return src.split("\n").map(raw => {
      const t = raw.trim(); if (!t) return "";
      const code = t.replace(/\/\/.*$/, "").replace(/^(PUBLIC|PRIVATE)\s+/i, "").trim().toUpperCase();
      if (/^(ENDIF|NEXT|ENDWHILE|UNTIL|ENDCASE|ENDPROCEDURE|ENDFUNCTION|ENDTYPE|ENDCLASS)\b/.test(code)) lvl = Math.max(0, lvl - 1);
      const line = "   ".repeat(/^ELSE\b/.test(code) ? Math.max(0, lvl - 1) : lvl) + t;
      if (/^(IF\b.*\bTHEN|FOR\b|WHILE\b|REPEAT\b|CASE\s+OF\b|PROCEDURE\b|FUNCTION\b|CLASS\b|TYPE\s+\w+$)/.test(code)) lvl++;
      return line;
    }).join("\n"); };
    const upperKw = src => src.replace(/(\/\/[^\n]*)|("[^"\n]*"|“[^”\n]*”)|(['ꞌ‘’][^'ꞌ‘’\n]['ꞌ‘’])|([A-Za-z_]\w*)/g,
      (m, c, s, ch, id) => id && (KW.has(id.toUpperCase()) || TY.has(id.toUpperCase())) ? id.toUpperCase() : m);
    const SN = [
      ["if", "IF … THEN", "IF <condition> THEN\n   <statements>\nENDIF"],
      ["ifelse", "IF … THEN … ELSE", "IF <condition> THEN\n   <statements>\nELSE\n   <statements>\nENDIF"],
      ["case", "CASE OF", "CASE OF <identifier>\n   <value> : <statement>\n   OTHERWISE : <statement>\nENDCASE"],
      ["for", "FOR loop", "FOR <identifier> ← <start> TO <end>\n   <statements>\nNEXT <identifier>"],
      ["while", "WHILE loop", "WHILE <condition>\n   <statements>\nENDWHILE"],
      ["repeat", "REPEAT loop", "REPEAT\n   <statements>\nUNTIL <condition>"],
      ["proc", "PROCEDURE", "PROCEDURE <name>(<param> : <type>)\n   <statements>\nENDPROCEDURE"],
      ["func", "FUNCTION", "FUNCTION <name>(<param> : <type>) RETURNS <type>\n   <statements>\n   RETURN <value>\nENDFUNCTION"],
      ["array", "Array declaration", "DECLARE <name> : ARRAY[1:<size>] OF <type>"],
      ["record", "Record type", "TYPE <name>\n   DECLARE <field> : <type>\nENDTYPE"],
      ["class", "CLASS", "CLASS <name>\n   PRIVATE <field> : <type>\n   PUBLIC PROCEDURE NEW(<param> : <type>)\n      <statements>\n   ENDPROCEDURE\nENDCLASS"],
      ["readfile", "Read a text file", "OPENFILE <name> FOR READ\nWHILE NOT EOF(<name>)\n   READFILE <name>, <variable>\nENDWHILE\nCLOSEFILE <name>"]
    ];
    const SAMPLE = '// Sample: press ' + (typeof navigator!=="undefined"&&/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+") + 'Enter to run\nDECLARE Total : INTEGER\nDECLARE Score : ARRAY[1:3] OF INTEGER\nTotal ← 0\nFOR Index ← 1 TO 3\n   OUTPUT "Enter score ", Index\n   INPUT Score[Index]\n   Total ← Total + Score[Index]\nNEXT Index\nOUTPUT "Average = ", Total / 3\n';
    const E = api.editor;
    SN.forEach(([id, label, text]) => api.registerCommand("ins_" + id, {
      label: "Insert " + label, category: "Pseudocode",
      run() {
        const [s, e] = E.sel(), [a] = E.lineBounds(s, s), ind = E.text().slice(a, s).match(/^[ \t]*/)[0], t = text.split("\n").join("\n" + ind);
        E.replace(s, e, t); const i = t.indexOf("<"), j = t.indexOf(">", i); if (i >= 0 && j > i) E.select(s + i, s + j + 1);
      }
    }));

    /* ================= Run console ================= */
    function openConsole(title) {
      const out = h("pre", { style: "background:var(--tb);border:1px solid var(--bd);padding:10px;height:45vh;overflow:auto;white-space:pre-wrap;margin:0 0 8px;font-family:ui-monospace,Consolas,monospace" });
      const label = h("label", {}, "Input"), inp = h("input", { type: "text", "aria-label": "Program input" });
      const row = h("div", { class: "row", style: "display:none" }, label, inp);
      let stopped = false, pending = null;
      const ctl = {
        print(s) { out.append(s); out.scrollTop = out.scrollHeight; },
        stopped: () => stopped,
        stop() { stopped = true; if (pending) { pending(null); pending = null; } row.style.display = "none"; },
        ask(l) { return new Promise(res => { pending = res; label.textContent = l + " ?"; row.style.display = ""; inp.value = ""; inp.focus(); }); }
      };
      inp.addEventListener("keydown", e => { if (e.key === "Enter" && pending) { const v = inp.value, r = pending; pending = null; row.style.display = "none"; ctl.print(v + "\n"); r(v); } });
      const stopBtn = h("button", { class: "btn", onclick: () => { ctl.stop(); ctl.print("\n[Stopped]\n"); } }, "Stop");
      Modal.open("Running " + title, h("div", {}, out, row, h("div", { class: "row" }, stopBtn, h("button", { class: "btn", onclick: () => Modal.close() }, "Close"))), { onClose: () => ctl.stop() });
      return ctl;
    }
    const report = e => { api.notify((e.line ? "Line " + e.line + ": " : "") + e.message, true); if (e.line) E.gotoLine(e.line); };
    const tryCompile = () => { try { return compile(api.doc().text); } catch (e) { report(e); return null; } };

    api.registerCommand("run", {
      label: "Run pseudocode", key: "mod+enter", category: "Pseudocode",
      async run() {
        const d = api.doc(), code = tryCompile(); if (code === null) return;
        const ctl = openConsole(d.name);
        const r = await execute(code, { out: s => ctl.print(s), ask: l => ctl.ask(l), stopped: ctl.stopped });
        if (r && !r.stopped) ctl.print("\nError (line " + r.line + "): " + r.message + "\n"); else if (!r) ctl.print("\n[Program finished]\n");
        ctl.stop();
      }
    });
    api.registerCommand("check", { label: "Check pseudocode for errors", category: "Pseudocode", run() { if (tryCompile() !== null) api.notify("No errors found."); } });
    api.registerCommand("showJs", { label: "Show generated JavaScript", category: "Pseudocode", run() { const c = tryCompile(); if (c !== null) api.openDoc("program.js", c.replace(/;(?=\$r\.l=)/g, ";\n")); } });
    api.registerCommand("new", { label: "New pseudocode program", category: "Pseudocode", run() { api.openDoc("program.pseudo", SAMPLE); } });
    api.registerCommand("mark", { label: "Treat this document as pseudocode", category: "Pseudocode", run() { const d = api.doc(); if (!isPc(d)) { d.name = d.name.replace(/\.[^.]*$/, "") + ".pseudo"; update(); UI.tabs(); UI.status(); } } });
    api.registerCommand("format", { label: "Re-indent pseudocode (3 spaces)", key: "alt+shift+f", category: "Pseudocode", run() { E.transform(reindent); } });
    api.registerCommand("upper", { label: "UPPERCASE keywords", category: "Pseudocode", run() { E.transform(upperKw); } });
    api.registerCommand("clearFiles", { label: "Delete virtual files used by programs", category: "Pseudocode", async run() { if (await api.confirm("Delete all " + FS.names().length + " text file(s) that pseudocode programs saved in this browser?")) { FS.clear(); api.notify("Virtual files deleted."); } } });
    api.addStatus("pc", () => isPc(api.doc()) ? "Pseudocode" : "");
    api.on("change", () => {   // type <- to get the assignment arrow
      const d = api.doc(); if (!isPc(d)) return; const [s, e] = E.sel();
      if (s === e && s >= 2 && E.text().slice(s - 2, s) === "<-") E.replace(s - 2, s, "←");
    });

    /* ================= Syntax colouring (overlay behind a transparent textarea) ================= */
    const hlText = s => {
      const re = /(\/\/[^\n]*)|("[^"\n]*"?|“[^”\n]*”?)|(['ꞌ‘’][^'ꞌ‘’\n]['ꞌ‘’])|(\d+(?:\.\d+)?)|([A-Za-z_]\w*)|(<-|←|<>|<=|>=|[-+*\/&=<>^])/g;
      const e = x => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      let o = "", i = 0, m;
      while ((m = re.exec(s))) {
        o += e(s.slice(i, m.index)); i = re.lastIndex; const t = m[0]; let c = null;
        if (m[1]) c = "pc"; else if (m[2] || m[3]) c = "ps"; else if (m[4]) c = "pn";
        else if (m[5]) { const u = t.toUpperCase(); c = u === "TRUE" || u === "FALSE" ? "pn" : TY.has(u) ? "pt" : KW.has(u) ? "pk" : BI.has(u) && /^\s*\(/.test(s.slice(i, i + 3)) ? "pf" : null; }
        else c = "po";
        o += c ? '<span class="' + c + '">' + e(t) + "</span>" : e(t);
      }
      return o + e(s.slice(i));
    };
    let update = () => {};
    if (typeof document !== "undefined" && document.getElementById("ed")) {
      const ta = E.ta, pane = document.getElementById("pane");
      const style = document.createElement("style");
      style.textContent = "#pane{position:relative}#ed{position:relative;z-index:1}#hl{position:absolute;z-index:0;margin:0;overflow:hidden;pointer-events:none;color:var(--tx)}#ed.pcm{color:transparent}#ed.pcm::selection{background:rgba(196,18,48,.28);color:transparent}.pk{color:var(--red)}.pt{color:#1f6fb2}.ps{color:#2e7d32}.pn{color:#b45f06}.pc{color:var(--mu);font-style:italic}.pf{color:#7b3fb0}.po{color:var(--mu)}[data-theme=midnight] .pt,[data-theme=contrast] .pt{color:#7cc0ff}[data-theme=midnight] .ps,[data-theme=contrast] .ps{color:#7fd18b}[data-theme=midnight] .pn,[data-theme=contrast] .pn{color:#ffb454}[data-theme=midnight] .pf,[data-theme=contrast] .pf{color:#c9a0ff}";
      const hl = h("pre", { id: "hl", "aria-hidden": "true" }), inner = h("div");
      hl.append(inner); document.head.append(style); pane.append(hl);
      const sync = () => {
        const cs = getComputedStyle(ta), s = hl.style;
        s.left = ta.offsetLeft + "px"; s.top = ta.offsetTop + "px"; s.width = ta.clientWidth + "px"; s.height = ta.clientHeight + "px";
        ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "whiteSpace", "overflowWrap", "wordBreak"].forEach(k => s[k] = cs[k]);
        inner.style.transform = "translate(" + -ta.scrollLeft + "px," + -ta.scrollTop + "px)";
      };
      let raf = 0;
      update = () => {
        const on = isPc(api.doc()); ta.classList.toggle("pcm", on); hl.style.display = on ? "" : "none";
        if (on) { inner.innerHTML = hlText(ta.value) + "\n "; sync(); }
      };
      const sched = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
      ["change", "switch", "close", "command"].forEach(ev => api.on(ev, sched));
      ta.addEventListener("scroll", sync); window.addEventListener("resize", sched);
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sched) : null; if (ro) ro.observe(ta);
      setTimeout(sched, 0);
      cleanup = () => { cancelAnimationFrame(raf); ta.removeEventListener("scroll", sync); window.removeEventListener("resize", sched); if (ro) ro.disconnect(); ta.classList.remove("pcm"); hl.remove(); style.remove(); };
    }
    if (typeof window !== "undefined") window.__pcCleanup = cleanup;
  },
  deactivate() { if (typeof window !== "undefined" && window.__pcCleanup) window.__pcCleanup(); }
});
