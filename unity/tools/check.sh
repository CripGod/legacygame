#!/usr/bin/env bash
# Checks the C# engine without Unity: compiles it with Roslyn under Mono and replays every golden trace through it.
#   unity/tools/check.sh            # engine compile, every turn, every Harborlight plan
#   unity/tools/check.sh turns      # only the turns
#   unity/tools/check.sh ai         # only the plans
#   unity/tools/check.sh dump seed-0026.json 4
#   unity/tools/check.sh exp        # Ieee754.Exp against Node's Math.exp, bit for bit
# Needs: mono (apt-get install mono-devel), curl, unzip, node (for exp). The compiler and Newtonsoft come from nuget.org
# into unity/tools/.cache on first run.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
cache="$here/.cache"
engine="$repo/unity/StandOnBusiness/Assets/StandOnBusiness/Engine"
mkdir -p "$cache"
if [ ! -f "$cache/csc/tasks/net472/csc.exe" ]; then
  echo "fetching the Roslyn compiler"
  curl -sSL -o "$cache/toolset.nupkg" https://api.nuget.org/v3-flatcontainer/microsoft.net.compilers.toolset/4.8.0/microsoft.net.compilers.toolset.4.8.0.nupkg
  mkdir -p "$cache/csc" && (cd "$cache/csc" && unzip -qo ../toolset.nupkg 'tasks/net472/*')
fi
if [ ! -f "$cache/Newtonsoft.Json.dll" ]; then
  echo "fetching Newtonsoft.Json"
  curl -sSL -o "$cache/nj.nupkg" https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.3/newtonsoft.json.13.0.3.nupkg
  (cd "$cache" && unzip -qo nj.nupkg 'lib/net45/Newtonsoft.Json.dll' && mv lib/net45/Newtonsoft.Json.dll . && rm -rf lib)
fi
mono45=/usr/lib/mono/4.5
refs="-r:$cache/Newtonsoft.Json.dll -r:$mono45/Facades/netstandard.dll -r:$mono45/System.Core.dll -r:$mono45/System.dll -r:$mono45/mscorlib.dll"
csc() { mono "$cache/csc/tasks/net472/csc.exe" -nologo -langversion:9 "$@"; }
echo "compiling the engine"
csc -target:library -out:"$cache/engine.dll" $refs "$engine"/*.cs
echo "compiling the harness"
csc -out:"$cache/harness.exe" -r:"$cache/engine.dll" $refs "$here"/Program.cs "$here"/Dump.cs "$here"/Ai.cs "$engine/Tests/JsonDiff.cs"
cd "$repo"
export SOB_ASSETS="$repo/unity/StandOnBusiness/Assets/StandOnBusiness"
run() { MONO_PATH="$cache" mono "$cache/harness.exe" "$@"; }
case "${1:-all}" in
  all) run turns 20 && run ai 10 ;;
  turns|ai) run "$1" "${2:-20}" ;;
  dump) run dump "$2" "$3" ;;
  exp)
    node -e '
      const xs=[]; for(let i=-800;i<=800;i++) xs.push(i*1.0);
      let s=12345; const r=()=>{s=(s*1103515245+12345)>>>0; return s/4294967296;};
      for(let i=0;i<20000;i++) xs.push((r()-0.5)*40);
      for(let i=0;i<5000;i++) xs.push((r()-0.5)*1e-3);
      for(let i=0;i<5000;i++) xs.push((r()-0.5)*1400);
      const fs=require("fs"); fs.writeFileSync(process.argv[1], xs.map(x=>x.toPrecision(21)).join("\n"));
      const b=new DataView(new ArrayBuffer(8));
      fs.writeFileSync(process.argv[2], xs.map(x=>{b.setFloat64(0,Math.exp(parseFloat(x.toPrecision(21)))); return b.getBigUint64(0).toString(16).padStart(16,"0");}).join("\n")+"\n");
    ' "$cache/exp-in.txt" "$cache/exp-js.txt"
    run exp "$cache/exp-in.txt" "$cache/exp-cs.txt"
    if diff -q "$cache/exp-js.txt" "$cache/exp-cs.txt" >/dev/null; then echo "exp: identical on $(wc -l < "$cache/exp-in.txt") inputs"; else echo "exp: DIFFERS"; diff "$cache/exp-js.txt" "$cache/exp-cs.txt" | head; exit 1; fi ;;
  *) echo "usage: check.sh [all|turns|ai|dump <file> <turn>|exp]"; exit 2 ;;
esac
