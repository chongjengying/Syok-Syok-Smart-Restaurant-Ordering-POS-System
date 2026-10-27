// Local vector artwork: no remote images, catalog storage URLs or font assets.
export default function DishArt({ kind = "rice", className = "" }) {
  return (
    <svg
      className={`pv-dish-art ${className}`}
      viewBox="0 0 240 160"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="120" cy="134" rx="70" ry="9" fill="#725132" opacity=".08" />
      {["rice", "chicken", "fries"].includes(kind) && (
        <>
          <ellipse cx="120" cy="90" rx="85" ry="53" fill="#fff" />
          <ellipse cx="120" cy="89" rx="72" ry="43" fill="#F2EFE8" />
          <ellipse cx="120" cy="89" rx="65" ry="38" fill="#FBF9F4" />
        </>
      )}
      {kind === "rice" && (
        <>
          <path
            d="M55 102 Q78 55 149 55 L180 104 Q119 130 55 102"
            fill="#617C40"
          />
          <path
            d="M84 90 Q83 48 119 47 Q153 49 152 91 Q122 109 84 90"
            fill="#FFF7D8"
          />
          <path
            d="M94 70l4-4m7 14l3-4m13-17l3-3m10 17l2-4m-17 17l4-3m-29-5l3-3m42 7l2-3"
            stroke="#E3D8B8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse cx="163" cy="86" rx="21" ry="17" fill="#AE4D2A" />
          <ellipse cx="164" cy="83" rx="18" ry="13" fill="#CB5B32" />
          <ellipse cx="77" cy="95" rx="18" ry="13" fill="#fff" />
          <ellipse cx="77" cy="94" rx="9" ry="8" fill="#F3B943" />
          <circle cx="116" cy="114" r="11" fill="#8CAC5D" />
          <circle cx="116" cy="114" r="7" fill="#CFDCAA" />
          <circle cx="135" cy="111" r="11" fill="#8CAC5D" />
          <circle cx="135" cy="111" r="7" fill="#CFDCAA" />
        </>
      )}
      {kind === "chicken" && (
        <>
          <path
            d="M82 75Q95 48 130 60Q159 67 154 91Q148 113 115 114Q71 113 75 94Z"
            fill="#A6532B"
          />
          <path
            d="M84 74Q101 56 128 65Q149 73 146 88Q138 105 108 104Q80 105 81 88Z"
            fill="#C7793B"
          />
          <path
            d="M98 68l-9 29m25-29l-10 34m26-27l-9 26m23-18l-7 16"
            stroke="#85452A"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M156 73l30 10m-34-3l30 11m-31-3l25 10"
            stroke="#E9B655"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="66" cy="80" r="9" fill="#67894E" />
          <circle cx="73" cy="69" r="10" fill="#7C9B5A" />
          <circle cx="65" cy="68" r="8" fill="#8CAA63" />
        </>
      )}
      {kind === "fries" && (
        <>
          <path
            d="M69 71l23 43m-10-52l24 44m-6-48l20 54m0-54l4 52m12-44l-3 48m18-48l-9 44m22-41l-13 41m-60-29l48 23m-39-36l49 20"
            stroke="#D89535"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M69 68l23 43m-10-52l24 44m-6-48l20 54m0-54l4 52m12-44l-3 48m18-48l-9 44m22-41l-13 41m-60-29l48 23m-39-36l49 20"
            stroke="#F0BE5E"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <ellipse cx="174" cy="100" rx="15" ry="12" fill="#DDD5C9" />
          <ellipse cx="174" cy="97" rx="13" ry="10" fill="#C54C33" />
        </>
      )}
      {kind === "burger" && (
        <>
          <ellipse cx="120" cy="124" rx="70" ry="15" fill="#FFFDF9" />
          <path d="M66 106h108q-2 22-53 23q-51-1-55-23" fill="#C98943" />
          <path d="M67 99q53-8 105 0v10H67Z" fill="#6D3E2C" />
          <path d="M65 92l22 9l13-5l24 6l25-9l25 7v-11H65" fill="#EFBF57" />
          <path
            d="M65 86l12-9l13 8l15-9l16 10l18-8l15 8l15-8l8 11l-15 6l-20-7l-17 8l-20-7l-20 7Z"
            fill="#7F9D51"
          />
          <path d="M65 78q1-43 54-43q55 0 57 43Z" fill="#DCA050" />
          <path d="M70 71q12-31 49-31q40 0 51 31" fill="#EDBB70" />
          <path
            d="M91 56l4-2m12-8l4-1m15 9l4 1m12-8l4 2m8 13l4 2m-46-1l3-1"
            stroke="#FFF0C8"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "tea" && (
        <>
          <path d="M95 35h54l-6 91q-20 12-42 0Z" fill="#D7E7E5" opacity=".8" />
          <path d="M99 55h47l-5 69q-20 9-38 0Z" fill="#B97935" opacity=".85" />
          <path
            d="M104 49l13 5l-5 16l-13-6m27-16l15 4l-4 16l-14-4m-17 29l15-3l3 15l-15 3"
            fill="#F6EACC"
            opacity=".55"
          />
          <path
            d="M134 74l17-57"
            stroke="#5D7770"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="97" cy="49" r="20" fill="#E5C455" />
          <circle cx="97" cy="49" r="16" fill="#F7E3A0" />
          <path
            d="M97 35v28m-14-14h28m-24-10l20 20m-20 0l20-20"
            stroke="#FFFAE4"
            strokeWidth="2"
          />
          <path d="M115 40q-9-21-20-16q-2 16 20 16" fill="#7B9A62" />
        </>
      )}
      {kind === "coffee" && (
        <>
          <ellipse cx="120" cy="122" rx="59" ry="14" fill="#FDFBF8" />
          <path
            d="M153 65q41-3 30 28q-8 17-31 10"
            stroke="#FDFBF8"
            strokeWidth="12"
          />
          <path d="M77 62h81l-5 47q-28 26-70 0Z" fill="#FFFDF9" />
          <ellipse cx="117" cy="62" rx="41" ry="13" fill="#E7DDD0" />
          <ellipse cx="117" cy="62" rx="34" ry="10" fill="#875838" />
          <path
            d="M103 34q-10-9 0-17m16 17q-10-9 0-17m16 17q-10-9 0-17"
            stroke="#C8B8A2"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M94 83h47" stroke="#F4EEE4" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
