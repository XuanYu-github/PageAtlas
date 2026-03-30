<script lang="ts">
  import {base} from '$app/paths';
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import SeoJsonLd from '../../components/SeoJsonLd.svelte';
  import PixelIcon from '../../components/icons/PixelIcon.svelte';
  import {iconArrowLeft} from '../../components/icons';

  let ready = false;
  onMount(() => {
    ready = true;
  });

  const cardClass = 'panel-paper pixel-reading-surface p-6 transition-transform duration-200 hover:translate-y-1';
</script>

<SeoJsonLd title={$t('seo.why_title')} description={$t('seo.why_desc')} />

<div class="min-h-screen flex text-neutral-800 flex-col">
  
  <div class="container mx-auto px-4 py-10 md:py-14 flex-1 max-w-5xl">
    
    {#if ready}
      <div 
        in:fly={{ y: 20, duration: 600, delay: 0, easing: cubicOut }} 
        class="mb-16"
      >
         <a href={base || '/'} class="btn farm-btn-secondary group mb-10 text-sm uppercase tracking-wider">
            <PixelIcon size={16} pixels={iconArrowLeft} class="group-hover:-translate-x-1 transition-transform"/>
            {$t('about.back_to_tool')}
          </a>

         <div class="hero-farm p-6 md:p-8">
           <div class="farm-kicker mb-3">{$t('about.kicker')}</div>
           <h1 class="text-3xl md:text-5xl mb-6 leading-tight tracking-tight text-gray-900">
            {$t('seo.why_title')}
           </h1>
          
           <p class="text-lg md:text-xl font-medium leading-relaxed panel-paper pixel-reading-surface p-6 md:p-8">
              {$t('seo.why_desc')}
           </p>
         </div>
       </div>

      <section class="mb-20">
        <h2 
          in:fly={{ y: 20, duration: 600, delay: 100 }}
          class="text-2xl md:text-3xl font-bold mb-10 flex items-center gap-3"
        >
          <span class="farm-badge">#</span>
          {$t('seo.features_title')}
        </h2>
        
        <div class="grid md:grid-cols-3 gap-6">
          {#each [
            { bg: 'bg-blue-100', title: $t('seo.feature_1_title'), desc: $t('seo.feature_1_desc'), delay: 200 },
            { bg: 'bg-green-100', title: $t('seo.feature_2_title'), desc: $t('seo.feature_2_desc'), delay: 300 },
            { bg: 'bg-pink-100', title: $t('seo.feature_3_title'), desc: $t('seo.feature_3_desc'), delay: 400 }
          ] as item}
            <div 
              in:fly={{ y: 30, duration: 500, delay: item.delay }}
              class={`${cardClass} ${item.bg}`}
            >
              <h3 class="text-lg font-bold mb-3 border-b-2 border-black/10 pb-2">{item.title}</h3>
              <p class="text-sm md:text-base font-medium text-gray-800 leading-relaxed">{item.desc}</p>
            </div>
          {/each}
        </div>
      </section>

      <section class="mb-20">
        <h2 
          in:fly={{ y: 20, duration: 600, delay: 500 }}
          class="text-2xl md:text-3xl font-bold mb-10 flex items-center gap-3"
        >
          <span class="farm-badge">?</span>
          {$t('seo.how_title')}
        </h2>
        
        <div 
          in:fly={{ y: 20, duration: 600, delay: 600 }}
          class="panel-paper pixel-reading-surface p-6 md:p-10"
        >
          <div class="space-y-3 relative">
            <div class="absolute left-[15px] top-4 bottom-4 w-0.5 border-l-2 border-dashed border-gray-300 -z-10 hidden md:block"></div>

            {#each [
              $t('seo.how_step_1'),
              $t('seo.how_step_2'),
              $t('seo.how_step_3'),
              $t('seo.how_step_4')
            ] as step, i}
              <div class="flex gap-6 items-start group">
                <div class="farm-badge w-10 h-10 !justify-center rounded-full transition-transform group-hover:scale-110">
                  {i + 1}
                </div>
                <div class="pt-0.5">
                  <p class="text-lg font-bold group-hover:text-blue-600 transition-colors duration-200">{step}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </section>

      <section class="mb-12">
        <h2 
          in:fly={{ y: 20, duration: 600, delay: 700 }}
          class="text-2xl md:text-3xl font-bold mb-10 text-center"
        >
          {$t('seo.faq_title')}
        </h2>
        
        <div class="space-y-4 mx-auto">
          {#each [
            { q: $t('seo.faq_1_q'), a: $t('seo.faq_1_a'), delay: 800 },
            { q: $t('seo.faq_2_q'), a: $t('seo.faq_2_a'), delay: 900 },
            { q: $t('seo.faq_3_q'), a: $t('seo.faq_3_a'), delay: 1000 },
            { q: $t('seo.faq_4_q'), a: $t('seo.faq_4_a'), delay: 1100 },
            { q: $t('seo.faq_5_q'), a: $t('seo.faq_5_a'), delay: 1200 }
          ] as faq}
            <div 
              in:fly={{ y: 20, duration: 500, delay: faq.delay }}
              class="panel-paper pixel-reading-surface p-6 hover:-translate-y-0.5 transition-all duration-200"
            >
              <h3 class="text-lg font-bold mb-3 flex items-start gap-2">
                <span class="text-blue-500">Q.</span> {faq.q}
              </h3>
              <p class="text-gray-600 pl-6 leading-relaxed border-l-2 border-gray-100 ml-1.5">{@html faq.a}</p>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</div>
