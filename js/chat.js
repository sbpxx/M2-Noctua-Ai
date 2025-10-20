document.addEventListener('DOMContentLoaded', function() {
 const sidebar = document.getElementById("sidebar");
    const collapseBtn = document.getElementById("btn-collapse");
    const submenuLinks = document.querySelectorAll(".menu-item.sub-menu > a");

    // Ouverture/fermeture de la sidebar
    collapseBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });

    // Ouverture/fermeture des sous-menus
    submenuLinks.forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const parent = link.parentElement;
        parent.classList.toggle("open");
      });
    });
});