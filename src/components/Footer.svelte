<script lang="ts">
  import {base} from '$app/paths';

  const year = new Date().getFullYear();
</script>
<footer class="w-full py-4 px-6 text-center text-sm text-gray-400 select-none">
  <p>
    © {year}
    <a
      href="https://github.com/XuanYu-github/PageAtlas"
      target="_blank"
      class="hover:text-black border-b border-transparent hover:border-black transition-all duration-300"
    >
      PageAtlas Lite
    </a>
      ·
    <a
      href={`${base}/about`}
      class="hover:text-black border-b border-transparent hover:border-black transition-all duration-300 mx-1"
    >
      About
    </a>
    <a
      href="https://github.com/XuanYu-github/PageAtlas"
      target="_blank"
      class="hover:text-black border-b border-transparent hover:border-black transition-all duration-300"
    >
      GitHub
    </a>
  </p>
</footer>
