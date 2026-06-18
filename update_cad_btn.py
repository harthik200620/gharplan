import os
with open(r"c:\archiproj\web\components\cad\floor-plan-cad.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Add a local state for vastu grid
old_state = "const [vb, setVb] = React.useState(base);"
new_state = "const [vb, setVb] = React.useState(base);\n  const [vastuGrid, setVastuGrid] = React.useState(showVastuGrid);"
code = code.replace(old_state, new_state)

# Update usage of showVastuGrid to use the state
code = code.replace("{showVastuGrid && (", "{vastuGrid && (")

# Add the toggle button
toolbar_old = """<button
            onClick={() => setVb(base)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
            title="Fit"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>"""
toolbar_new = """<button
            onClick={() => setVb(base)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
            title="Fit"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-slate-300 mx-1" />
          <button
            onClick={() => setVastuGrid(v => !v)}
            className={cn("px-2 h-7 rounded-md text-[11px] font-semibold transition-colors", vastuGrid ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100")}
          >
            VASTU
          </button>
        </div>"""
code = code.replace(toolbar_old, toolbar_new)

with open(r"c:\archiproj\web\components\cad\floor-plan-cad.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("Added toggle button")
