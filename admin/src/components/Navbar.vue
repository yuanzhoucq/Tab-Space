<template>
  <nav>
    <div class="export">
      <span class="link">
        {{$lang.export}}
        <small>▼</small>
      </span>
      <div class="export-dropdown">
        <span class="link" href="#" @click="exportTabs('Text')">{{$lang.exportText}}</span>
        <br />
        <span class="link" href="#" @click="exportTabs('MD')">{{$lang.exportMD}}</span>
        <br />
        <span class="link" href="#" @click="exportTabs('HTML')">{{$lang.exportHTML}}</span>
        <br />
        <span class="link" href="#" @click="exportTabs('JSON')">{{$lang.exportJSON}}</span>
      </div>
    </div>
    <div>
      <label for="file-input" class="link">
        {{$lang.import}}
        <small>
          (
          <code>.tabspace</code>)
        </small>
      </label>
      <input type="file" id="file-input" @change="importTabs" accept=".tabspace" />
    </div>
    <div>
      <a
        class="link"
        target="_blank"
        href="https://joyuer.cn/Tab-Space/settings.html"
      >{{$lang.settings}}</a>
    </div>
  </nav>
</template>

<script>
export default {
  name: "Navbar"
};
</script>

<style scope>
nav {
    display: flex;
    justify-content: flex-end;
}

nav > div {
    margin-right: 5px;
}
</style>